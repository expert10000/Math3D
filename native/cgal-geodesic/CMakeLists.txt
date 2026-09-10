cmake_minimum_required(VERSION 3.20)
project(math3d_cgal_geodesic LANGUAGES CXX)

find_package(CGAL CONFIG REQUIRED)
add_executable(cgal-geodesic cgal-geodesic.cpp)
target_compile_features(cgal-geodesic PRIVATE cxx_std_17)
target_link_libraries(cgal-geodesic PRIVATE CGAL::CGAL)
