#!/usr/bin/env bash
# Builds lc0, the reference engine for the Maia-1 Base Models, into tools/.
#
# lc0 has no Linux release binary, so it is compiled from a pinned tag. Two
# of its backends are built in, because verifying a converted model needs both:
#   eigen     runs the original .pb.gz weights on plain CPU code (the reference)
#   onnx-cpu  runs an ONNX graph through ONNX Runtime (the converted model)
# lc0 also provides the converters leela2onnx and onnx2leela.
#
# Run from the repository root:
#
#     scripts/build_lc0.sh
#
# Needs git, curl, python3 and a C++ compiler. Meson and Ninja are installed
# into a throwaway virtual environment, not the project's.

set -euo pipefail

LC0_TAG="v0.32.1"
ONNXRUNTIME_VERSION="1.30.0"
ONNXRUNTIME_SHA256="a5ed5a3cac51fbb2e90da632ae43d19212faaa20e76484e62bcb7c23ddb3b3fd"

TOOLS_DIR="$(pwd)/tools"
ONNXRUNTIME_DIR="$TOOLS_DIR/onnxruntime-linux-x64-$ONNXRUNTIME_VERSION"
LC0_SOURCE_DIR="$TOOLS_DIR/lc0-source"
BUILD_ENV_DIR="$TOOLS_DIR/build-env"

mkdir -p "$TOOLS_DIR"

if [ ! -d "$ONNXRUNTIME_DIR" ]; then
  archive="$TOOLS_DIR/onnxruntime.tgz"
  curl --fail --location --silent --show-error --output "$archive" \
    "https://github.com/microsoft/onnxruntime/releases/download/v$ONNXRUNTIME_VERSION/onnxruntime-linux-x64-$ONNXRUNTIME_VERSION.tgz"
  echo "$ONNXRUNTIME_SHA256  $archive" | sha256sum --check --quiet
  tar --extract --gzip --file "$archive" --directory "$TOOLS_DIR"
  rm "$archive"
fi

if [ ! -d "$LC0_SOURCE_DIR" ]; then
  git clone --quiet --depth 1 --branch "$LC0_TAG" \
    https://github.com/LeelaChessZero/lc0.git "$LC0_SOURCE_DIR"
fi

if [ ! -d "$BUILD_ENV_DIR" ]; then
  python3 -m venv "$BUILD_ENV_DIR"
  "$BUILD_ENV_DIR/bin/pip" install --quiet meson ninja
fi
export PATH="$BUILD_ENV_DIR/bin:$PATH"

cd "$LC0_SOURCE_DIR"
if [ ! -d build ]; then
  # Every GPU backend is switched off: none is needed to compare outputs, and
  # each would need its own vendor toolkit installed.
  meson setup build --buildtype=release \
    -Dgtest=false -Dpython_bindings=false -Drescorer=false \
    -Dblas=true -Dcudnn=false -Dplain_cuda=false -Dopencl=false \
    -Ddx=false -Dxla=false -Dsycl=off \
    -Donnx_libdir="$ONNXRUNTIME_DIR/lib" \
    -Donnx_include="$ONNXRUNTIME_DIR/include"
fi
ninja -C build

cp build/lc0 "$TOOLS_DIR/lc0"
echo "Built $TOOLS_DIR/lc0 ($LC0_TAG, ONNX Runtime $ONNXRUNTIME_VERSION)"
