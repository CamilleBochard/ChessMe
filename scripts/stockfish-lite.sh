#!/bin/sh
# The build of Stockfish the site runs in the browser, Stockfish 19 lite on a
# single thread compiled to WebAssembly, run under Node as a UCI engine so the
# pipeline can measure moves at the browser's settings.
here=$(dirname "$0")
exec node "$here/../node_modules/stockfish/bin/stockfish-19-lite-single.js"
