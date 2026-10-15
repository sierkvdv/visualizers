#!/bin/bash
# Deep SamSo Club in de browser: start een lokale server in deze map en opent de club.
cd "$(dirname "$0")"
(sleep 1; open "http://localhost:8091/") &
python3 -m http.server 8091
