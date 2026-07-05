# native/ — optional C++ acceleration

A fast geometric shelf/skyline packer (C++17) with a `pybind11` binding, plus a
Python loader (`accelerator.py`) that falls back to the pure-Python engine when
the module isn't built.

## Honest scope

- This is a **heuristic** packer, not a MILP solver. 3D bin packing is NP-hard;
  exact MILP does not run at cell speed for high-mix inbound. A fast geometric
  heuristic is what actually runs on the edge — which is what this is.
- It is **not bit-identical** to `palletizer_full.optimizer`. It can place a
  slightly different set of boxes on mixed-SKU inputs. Keep production plans on
  the parity-checked Python/TS path; use this where raw packing speed matters
  and a small quality delta is acceptable. Making it bit-identical and adding it
  to `scripts/verify_engine_parity.py` is the follow-up if you want to route
  production through it.

## Build

```bash
pip install pybind11
./native/build.sh          # no cmake required
# or:  cmake -S native -B native/build && cmake --build native/build
```

## Verify + benchmark

```bash
python3 -c "from native import accelerator; print('native available:', accelerator.available())"
python3 examples/native_benchmark.py
```

Measured on a dev container (your numbers will vary): ~6–7× faster than the
Python path on 50–800 mixed boxes, comparable placement counts.
