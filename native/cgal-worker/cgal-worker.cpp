#include <CGAL/Exact_predicates_exact_constructions_kernel.h>
#include <CGAL/Surface_mesh.h>
#include <CGAL/Polygon_mesh_processing/corefinement.h>
#include <CGAL/Polygon_mesh_processing/triangulate_faces.h>
#include <CGAL/boost/graph/helpers.h>
#include <CGAL/number_utils.h>
#include <array>
#include <cmath>
#include <cstdint>
#include <cstdio>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <string>
#include <vector>
#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

using Kernel = CGAL::Exact_predicates_exact_constructions_kernel;
using Mesh = CGAL::Surface_mesh<Kernel::Point_3>;
namespace PMP = CGAL::Polygon_mesh_processing;

namespace {
constexpr uint32_t MAX_FRAME = 1024u * 1024u * 1024u;
constexpr uint32_t MAX_MESH = 512u * 1024u * 1024u;
constexpr uint16_t PROTOCOL = 1;

uint16_t u16(const unsigned char* p) { return uint16_t(p[0]) | uint16_t(p[1]) << 8; }
uint32_t u32(const unsigned char* p) {
  return uint32_t(p[0]) | uint32_t(p[1]) << 8 | uint32_t(p[2]) << 16 | uint32_t(p[3]) << 24;
}
void put16(std::vector<unsigned char>& out, uint16_t n) {
  out.push_back(static_cast<unsigned char>(n)); out.push_back(static_cast<unsigned char>(n >> 8));
}
void put32(std::vector<unsigned char>& out, uint32_t n) {
  for (int i = 0; i < 4; ++i) out.push_back(static_cast<unsigned char>(n >> (i * 8)));
}
bool read_exact(unsigned char* dst, size_t n) {
  while (n) {
    const size_t got = std::fread(dst, 1, n, stdin);
    if (!got) return false;
    dst += got; n -= got;
  }
  return true;
}
void write_response(uint16_t status, uint32_t opcode, const std::string& job,
                    const std::vector<unsigned char>& mesh, const std::string& message) {
  std::vector<unsigned char> header{'M', '3', 'D', 'C'};
  put16(header, PROTOCOL); put16(header, status);
  put32(header, static_cast<uint32_t>(job.size()));
  put32(header, static_cast<uint32_t>(mesh.size()));
  put32(header, static_cast<uint32_t>(message.size()));
  put32(header, opcode); put32(header, 0);
  std::fwrite(header.data(), 1, header.size(), stdout);
  std::fwrite(job.data(), 1, job.size(), stdout);
  if (!mesh.empty()) std::fwrite(mesh.data(), 1, mesh.size(), stdout);
  std::fwrite(message.data(), 1, message.size(), stdout);
  std::fflush(stdout);
}
Mesh decode_mesh(const unsigned char* data, size_t size) {
  if (size < 32 || std::memcmp(data, "M3DM", 4) || u16(data + 4) != 1 ||
      u16(data + 6) != 32 || u32(data + 28) != 0) throw std::runtime_error("Invalid M3D mesh header");
  const uint32_t vertices = u32(data + 8), faces = u32(data + 12);
  if (uint64_t(vertices) * 12 != u32(data + 16) || uint64_t(faces) * 12 != u32(data + 20) ||
      uint64_t(32) + u32(data + 16) + u32(data + 20) != size || u32(data + 24) != size)
    throw std::runtime_error("Invalid M3D mesh length");
  Mesh mesh;
  std::vector<Mesh::Vertex_index> handles;
  handles.reserve(vertices);
  for (uint32_t i = 0; i < vertices; ++i) {
    float xyz[3]; std::memcpy(xyz, data + 32 + size_t(i) * 12, 12);
    if (!std::isfinite(xyz[0]) || !std::isfinite(xyz[1]) || !std::isfinite(xyz[2]))
      throw std::runtime_error("Non-finite mesh vertex");
    handles.push_back(mesh.add_vertex(Kernel::Point_3(xyz[0], xyz[1], xyz[2])));
  }
  const unsigned char* index_data = data + 32 + size_t(vertices) * 12;
  for (uint32_t i = 0; i < faces; ++i) {
    const uint32_t a = u32(index_data + size_t(i) * 12);
    const uint32_t b = u32(index_data + size_t(i) * 12 + 4);
    const uint32_t c = u32(index_data + size_t(i) * 12 + 8);
    if (a >= vertices || b >= vertices || c >= vertices || a == b || b == c || a == c ||
        mesh.add_face(handles[a], handles[b], handles[c]) == Mesh::null_face())
      throw std::runtime_error("Invalid or non-manifold mesh face");
  }
  if (faces == 0 || !CGAL::is_closed(mesh)) throw std::runtime_error("Boolean inputs must be closed triangle meshes");
  return mesh;
}
std::vector<unsigned char> encode_mesh(Mesh& mesh) {
  PMP::triangulate_faces(mesh);
  mesh.collect_garbage();
  if (mesh.number_of_vertices() > std::numeric_limits<uint32_t>::max() / 12 ||
      mesh.number_of_faces() > std::numeric_limits<uint32_t>::max() / 12 ||
      uint64_t(32) + mesh.number_of_vertices() * 12 + mesh.number_of_faces() * 12 > MAX_MESH)
    throw std::runtime_error("Boolean result exceeds M3D resource limit");
  std::vector<unsigned char> out{'M', '3', 'D', 'M'};
  put16(out, 1); put16(out, 32);
  put32(out, static_cast<uint32_t>(mesh.number_of_vertices()));
  put32(out, static_cast<uint32_t>(mesh.number_of_faces()));
  put32(out, static_cast<uint32_t>(mesh.number_of_vertices() * 12));
  put32(out, static_cast<uint32_t>(mesh.number_of_faces() * 12));
  put32(out, static_cast<uint32_t>(32 + mesh.number_of_vertices() * 12 + mesh.number_of_faces() * 12));
  put32(out, 0);
  std::vector<uint32_t> indices(mesh.number_of_vertices());
  uint32_t next = 0;
  for (auto vertex : mesh.vertices()) {
    indices[vertex.idx()] = next++;
    const auto& point = mesh.point(vertex);
    for (double value : {CGAL::to_double(point.x()), CGAL::to_double(point.y()), CGAL::to_double(point.z())}) {
      const float f = static_cast<float>(value);
      if (!std::isfinite(f)) throw std::runtime_error("Boolean result is outside float32 range");
      unsigned char bytes[4]; std::memcpy(bytes, &f, 4); out.insert(out.end(), bytes, bytes + 4);
    }
  }
  for (auto face : mesh.faces()) {
    auto halfedge = mesh.halfedge(face);
    for (int i = 0; i < 3; ++i) {
      put32(out, indices[mesh.target(halfedge).idx()]);
      halfedge = mesh.next(halfedge);
    }
    if (halfedge != mesh.halfedge(face)) throw std::runtime_error("Result face is not triangular");
  }
  return out;
}
std::vector<unsigned char> boolean_mesh(const unsigned char* a_data, size_t a_size,
                                        const unsigned char* b_data, size_t b_size, uint32_t operation) {
  Mesh a = decode_mesh(a_data, a_size), b = decode_mesh(b_data, b_size), result;
  bool ok = false;
  if (operation == 1) ok = PMP::corefine_and_compute_union(a, b, result);
  else if (operation == 2) ok = PMP::corefine_and_compute_difference(a, b, result);
  else if (operation == 3) ok = PMP::corefine_and_compute_intersection(a, b, result);
  else throw std::runtime_error("Unknown Boolean operation");
  if (!ok) throw std::runtime_error("CGAL corefinement could not construct a valid result");
  return encode_mesh(result);
}
} // namespace

int main() {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  for (;;) {
    std::array<unsigned char, 28> header{};
    if (!read_exact(header.data(), header.size())) return std::feof(stdin) ? 0 : 1;
    if (std::memcmp(header.data(), "M3DC", 4) || u16(header.data() + 4) != PROTOCOL ||
        u32(header.data() + 24) != 0) return 2;
    const uint16_t opcode = u16(header.data() + 6);
    const uint32_t job_size = u32(header.data() + 8), a_size = u32(header.data() + 12),
                   b_size = u32(header.data() + 16), operation = u32(header.data() + 20);
    if (job_size > 4096 || a_size > MAX_MESH || b_size > MAX_MESH ||
        uint64_t(job_size) + a_size + b_size > MAX_FRAME) return 3;
    std::vector<unsigned char> payload(size_t(job_size) + a_size + b_size);
    if (!read_exact(payload.data(), payload.size())) return 4;
    const std::string job(reinterpret_cast<const char*>(payload.data()), job_size);
    try {
      if (opcode == 1) write_response(0, opcode, job, {}, "healthy");
      else if (opcode == 2) write_response(0, opcode, job, {}, "math3d-cgal-worker/1;protocol=1;capabilities=mesh.boolean");
      else if (opcode == 3) {
        if (!a_size || !b_size) throw std::runtime_error("Boolean request requires two M3D meshes");
        auto output = boolean_mesh(payload.data() + job_size, a_size,
                                   payload.data() + job_size + a_size, b_size, operation);
        write_response(0, opcode, job, output, "native-cgal");
      } else throw std::runtime_error("Unsupported native worker operation");
    } catch (const std::exception& e) {
      write_response(1, opcode, job, {}, e.what());
    }
  }
}
