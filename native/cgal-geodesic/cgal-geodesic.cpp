#include <CGAL/Simple_cartesian.h>
#include <CGAL/Surface_mesh.h>
#include <CGAL/Surface_mesh_shortest_path.h>

#include <array>
#include <cmath>
#include <fstream>
#include <iomanip>
#include <iostream>
#include <iterator>
#include <sstream>
#include <stdexcept>
#include <string>
#include <vector>

using Kernel = CGAL::Simple_cartesian<double>;
using Point = Kernel::Point_3;
using Mesh = CGAL::Surface_mesh<Point>;
using Traits = CGAL::Surface_mesh_shortest_path_traits<Kernel, Mesh>;
using ShortestPath = CGAL::Surface_mesh_shortest_path<Traits>;
using Barycentric = Traits::Barycentric_coordinates;

struct Location {
  std::size_t face;
  Barycentric bary;
};

std::string json_escape(const std::string& input) {
  std::ostringstream out;
  for (const char ch : input) {
    switch (ch) {
      case '\\': out << "\\\\"; break;
      case '"': out << "\\\""; break;
      case '\n': out << "\\n"; break;
      case '\r': out << "\\r"; break;
      case '\t': out << "\\t"; break;
      default: out << ch; break;
    }
  }
  return out.str();
}

Location read_location(std::istream& stream, std::size_t face_count, const char* label) {
  std::size_t face = 0;
  double b0 = 0.0, b1 = 0.0, b2 = 0.0;
  if (!(stream >> face >> b0 >> b1 >> b2)) {
    throw std::runtime_error(std::string("Could not read ") + label + " surface location");
  }
  if (face >= face_count) {
    throw std::runtime_error(std::string(label) + " face is out of range");
  }
  return {face, Barycentric{{b0, b1, b2}}};
}

Location map_location_to_cgal_order(
  const Location& input,
  const Mesh& mesh,
  const std::vector<Mesh::Face_index>& faces_by_input,
  const std::vector<std::array<std::size_t, 3>>& triangles_by_input) {
  const auto face = faces_by_input[input.face];
  const auto halfedge = mesh.halfedge(face);
  const std::array<std::size_t, 3> ordered_vertices{{
    static_cast<std::size_t>(mesh.source(halfedge).idx()),
    static_cast<std::size_t>(mesh.target(halfedge).idx()),
    static_cast<std::size_t>(mesh.target(mesh.next(halfedge)).idx()),
  }};
  const auto& original_vertices = triangles_by_input[input.face];
  Barycentric mapped{{0.0, 0.0, 0.0}};
  for (std::size_t ordered = 0; ordered < 3; ++ordered) {
    bool found = false;
    for (std::size_t original = 0; original < 3; ++original) {
      if (ordered_vertices[ordered] == original_vertices[original]) {
        mapped[ordered] = input.bary[original];
        found = true;
        break;
      }
    }
    if (!found) throw std::runtime_error("Could not map barycentric coordinates to CGAL face order");
  }
  return {input.face, mapped};
}

int main(int argc, char** argv) {
  try {
    if (argc != 2) throw std::runtime_error("Usage: cgal-geodesic <request-file>");
    std::ifstream input(argv[1]);
    if (!input) throw std::runtime_error("Could not open request file");

    std::size_t vertex_count = 0, face_count = 0, source_count = 0;
    if (!(input >> vertex_count >> face_count >> source_count) || vertex_count == 0 || face_count == 0 || source_count == 0) {
      throw std::runtime_error("Invalid mesh/source header");
    }

    Mesh mesh;
    std::vector<Mesh::Vertex_index> vertices;
    vertices.reserve(vertex_count);
    for (std::size_t index = 0; index < vertex_count; ++index) {
      double x = 0.0, y = 0.0, z = 0.0;
      if (!(input >> x >> y >> z)) throw std::runtime_error("Could not read mesh vertices");
      vertices.push_back(mesh.add_vertex(Point(x, y, z)));
    }

    std::vector<Mesh::Face_index> faces_by_input;
    std::vector<std::array<std::size_t, 3>> triangles_by_input;
    faces_by_input.reserve(face_count);
    triangles_by_input.reserve(face_count);
    for (std::size_t index = 0; index < face_count; ++index) {
      std::size_t a = 0, b = 0, c = 0;
      if (!(input >> a >> b >> c) || a >= vertex_count || b >= vertex_count || c >= vertex_count) {
        throw std::runtime_error("Could not read valid mesh triangles");
      }
      const auto face = mesh.add_face(vertices[a], vertices[b], vertices[c]);
      if (face == Mesh::null_face()) {
        throw std::runtime_error("CGAL requires an orientable manifold triangle mesh; a face could not be inserted");
      }
      faces_by_input.push_back(face);
      triangles_by_input.push_back({{a, b, c}});
    }

    std::vector<Location> sources;
    sources.reserve(source_count);
    for (std::size_t index = 0; index < source_count; ++index) {
      sources.push_back(map_location_to_cgal_order(
        read_location(input, face_count, "source"), mesh, faces_by_input, triangles_by_input));
    }
    const Location target = map_location_to_cgal_order(
      read_location(input, face_count, "target"), mesh, faces_by_input, triangles_by_input);

    ShortestPath shortest_paths(mesh);
    for (const auto& source : sources) {
      shortest_paths.add_source_point(faces_by_input[source.face], source.bary);
    }

    std::vector<Point> path_points;
    const auto result = shortest_paths.shortest_path_points_to_source_points(
      faces_by_input[target.face], target.bary, std::back_inserter(path_points));
    if (result.first < 0.0 || result.second == shortest_paths.source_points_end()) {
      std::cout << "{\"ok\":false,\"disconnected\":true,\"error\":\"Source and target are disconnected\"}\n";
      return 2;
    }

    const auto& chosen = *result.second;
    std::size_t source_index = source_count;
    for (std::size_t index = 0; index < sources.size(); ++index) {
      if (faces_by_input[sources[index].face] != chosen.first) continue;
      const auto& a = sources[index].bary;
      const auto& b = chosen.second;
      if (std::abs(a[0] - b[0]) < 1e-10 && std::abs(a[1] - b[1]) < 1e-10 && std::abs(a[2] - b[2]) < 1e-10) {
        source_index = index;
        break;
      }
    }
    if (source_index == source_count) throw std::runtime_error("Could not resolve the selected CGAL source point");
    if (path_points.size() < 2) throw std::runtime_error("CGAL returned an empty surface path");

    std::cout << std::setprecision(17)
              << "{\"ok\":true,\"method\":\"cgal-surface-shortest-path\",\"length\":" << result.first
              << ",\"sourceIndex\":" << source_index << ",\"polyline\":[";
    for (std::size_t index = 0; index < path_points.size(); ++index) {
      if (index) std::cout << ',';
      const auto& point = path_points[index];
      std::cout << '[' << point.x() << ',' << point.y() << ',' << point.z() << ']';
    }
    std::cout << "]}\n";
    return 0;
  } catch (const std::exception& error) {
    std::cout << "{\"ok\":false,\"error\":\"" << json_escape(error.what()) << "\"}\n";
    return 1;
  }
}
