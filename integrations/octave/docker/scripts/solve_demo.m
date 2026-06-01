function solve_demo(inputPath, outputPath)
  data = jsondecode(fileread(inputPath));
  A = data.matrix;
  b = data.rhs;

  x = A \ b;
  residual = norm(A * x - b);

  result.ok = true;
  result.engine = "gnu-octave";
  result.solution = x;
  result.residualNorm = residual;

  fid = fopen(outputPath, "w");
  fprintf(fid, "%s", jsonencode(result));
  fclose(fid);
end
