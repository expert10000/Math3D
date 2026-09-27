cmake_minimum_required(VERSION 3.20)
project(math3d_cgal_worker LANGUAGES CXX)

find_package(CGAL CONFIG REQUIRED)
add_executable(math3d-cgal-worker cgal-worker.cpp)
target_compile_features(math3d-cgal-worker PRIVATE cxx_std_17)
target_link_libraries(math3d-cgal-worker PRIVATE CGAL::CGAL)
