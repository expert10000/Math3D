FROM python:3.11-slim

WORKDIR /opt/math3d/matlab

COPY service/requirements.txt /opt/math3d/matlab/service/requirements.txt
RUN pip install --no-cache-dir -r /opt/math3d/matlab/service/requirements.txt

COPY service /opt/math3d/matlab/service
COPY compiled/eig_demo_package /opt/math3d/matlab/eig_demo_package

ENV AGREE_TO_MATLAB_RUNTIME_LICENSE=yes
ENV MATLAB_PACKAGE_PATH=/opt/math3d/matlab/eig_demo_package
ENV PYTHONUNBUFFERED=1
ENV PORT=8765

EXPOSE 8765

CMD ["python", "/opt/math3d/matlab/service/app.py"]

