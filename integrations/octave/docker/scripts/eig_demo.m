function eig_demo(inputPath, outputPath)
  data = jsondecode(fileread(inputPath));
  A = data.matrix;

  [V, D] = eig(A);

  result.ok = true;
  result.engine = "gnu-octave";
  result.eigenvalues = diag(D);
  result.eigenvectors = V;

  fid = fopen(outputPath, "w");
  fprintf(fid, "%s", jsonencode(result));
  fclose(fid);
end
