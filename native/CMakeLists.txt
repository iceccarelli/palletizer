cmake_minimum_required(VERSION 3.15)
project(palletizer_native LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
set(CMAKE_CXX_FLAGS_RELEASE "-O3")

find_package(pybind11 CONFIG REQUIRED)
pybind11_add_module(palletizer_native palletizer_native.cpp)

# Places the compiled .so next to this CMakeLists so accelerator.py finds it.
set_target_properties(palletizer_native PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR})
