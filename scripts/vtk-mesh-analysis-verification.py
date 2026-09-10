#!/usr/bin/env python3
"""Independent VTK references for Mesh Analyze v1 curvature and triangle quality."""

from __future__ import annotations

import math
import statistics

import vtk


def finite_values(array: vtk.vtkDataArray) -> list[float]:
    return [
        float(array.GetTuple1(index))
        for index in range(array.GetNumberOfTuples())
        if math.isfinite(float(array.GetTuple1(index)))
    ]


def verify_unit_sphere_curvature() -> None:
    sphere = vtk.vtkSphereSource()
    sphere.SetRadius(1.0)
    sphere.SetThetaResolution(96)
    sphere.SetPhiResolution(64)
    sphere.Update()

    triangle_filter = vtk.vtkTriangleFilter()
    triangle_filter.SetInputConnection(sphere.GetOutputPort())
    triangle_filter.Update()

    gaussian = vtk.vtkCurvatures()
    gaussian.SetInputConnection(triangle_filter.GetOutputPort())
    gaussian.SetCurvatureTypeToGaussian()
    gaussian.Update()
    gaussian_values = finite_values(gaussian.GetOutput().GetPointData().GetScalars())

    mean = vtk.vtkCurvatures()
    mean.SetInputConnection(triangle_filter.GetOutputPort())
    mean.SetCurvatureTypeToMean()
    mean.Update()
    mean_values = finite_values(mean.GetOutput().GetPointData().GetScalars())

    gaussian_median = statistics.median(gaussian_values)
    mean_abs_median = statistics.median(abs(value) for value in mean_values)
    if abs(gaussian_median - 1.0) > 0.08:
        raise AssertionError(f"VTK unit-sphere Gaussian curvature median {gaussian_median:.8g} is not near 1")
    if abs(mean_abs_median - 1.0) > 0.08:
        raise AssertionError(f"VTK unit-sphere |mean curvature| median {mean_abs_median:.8g} is not near 1")
    print(
        "PASS VTK unit sphere: "
        f"K median={gaussian_median:.8g}, |H| median={mean_abs_median:.8g}, samples={len(gaussian_values)}"
    )


def equilateral_triangle() -> vtk.vtkPolyData:
    points = vtk.vtkPoints()
    points.InsertNextPoint(0.0, 0.0, 0.0)
    points.InsertNextPoint(1.0, 0.0, 0.0)
    points.InsertNextPoint(0.5, math.sqrt(3.0) / 2.0, 0.0)
    triangle = vtk.vtkTriangle()
    for index in range(3):
        triangle.GetPointIds().SetId(index, index)
    cells = vtk.vtkCellArray()
    cells.InsertNextCell(triangle)
    output = vtk.vtkPolyData()
    output.SetPoints(points)
    output.SetPolys(cells)
    return output


def triangle_quality(measure: str) -> float:
    quality = vtk.vtkMeshQuality()
    quality.SetInputData(equilateral_triangle())
    getattr(quality, f"SetTriangleQualityMeasureTo{measure}")()
    quality.Update()
    values = quality.GetOutput().GetCellData().GetArray("Quality")
    if values is None or values.GetNumberOfTuples() != 1:
        raise AssertionError(f"VTK did not produce one {measure} triangle-quality value")
    return float(values.GetTuple1(0))


def verify_equilateral_quality() -> None:
    aspect = triangle_quality("AspectRatio")
    minimum_angle = triangle_quality("MinAngle")
    if abs(aspect - 1.0) > 1e-6:
        raise AssertionError(f"VTK equilateral aspect ratio {aspect:.8g} is not 1")
    if abs(minimum_angle - 60.0) > 1e-4:
        raise AssertionError(f"VTK equilateral minimum angle {minimum_angle:.8g} is not 60 degrees")
    print(f"PASS VTK equilateral triangle: aspect={aspect:.8g}, minimum angle={minimum_angle:.8g} deg")


def main() -> int:
    print(f"VTK {vtk.vtkVersion.GetVTKVersion()} Mesh Analyze verification")
    verify_unit_sphere_curvature()
    verify_equilateral_quality()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
