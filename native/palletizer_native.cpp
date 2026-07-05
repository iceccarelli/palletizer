// palletizer_native.cpp
//
// A fast geometric shelf/skyline packer for end-of-line palletising.
//
// This is a HEURISTIC packer, not a MILP solver. That is a deliberate,
// honest choice: 3D bin packing is NP-hard, and exact MILP does not run in
// real time for high-mix inbound at cell speed. What actually runs on the
// edge in production systems is a fast geometric heuristic — which is exactly
// this. The Python engine in palletizer_full/optimizer.py implements the same
// shelf-packing idea; this module is a drop-in accelerated path that returns
// geometry with identical semantics, so browser/edge/native parity is
// preserved. Use it when layer counts get large enough that the Python loop
// shows up in a profile; otherwise the pure-Python path is perfectly fine.
//
// Build (standalone, no cmake):
//   c++ -O3 -Wall -shared -std=c++17 -fPIC \
//       $(python3 -m pybind11 --includes) \
//       palletizer_native.cpp \
//       -o palletizer_native$(python3-config --extension-suffix)
//
// Or use the provided CMakeLists.txt.

#include <pybind11/pybind11.h>
#include <pybind11/stl.h>

#include <algorithm>
#include <string>
#include <vector>

namespace py = pybind11;

namespace {

struct Box {
    std::string sku_id;
    double length_mm;
    double width_mm;
    double height_mm;
    double weight_kg;
};

struct Placement {
    std::string sku_id;
    double x_mm;
    double y_mm;
    double z_mm;
    double length_mm;   // footprint length AFTER rotation
    double width_mm;    // footprint width AFTER rotation
    double height_mm;
    double weight_kg;
    double rot_deg;     // 0 or 90
    int layer;
};

// One shelf occupies a horizontal band [y, y + shelf_depth) at a fixed z.
// Boxes are laid left-to-right; when a box does not fit the current row we
// start a new shelf above the tallest box seen so far in the layer.
std::vector<Placement> pack_layer(std::vector<Box>& boxes,
                                  double pallet_len,
                                  double pallet_wid,
                                  int layer_index,
                                  double base_z) {
    // Tallest-footprint-first improves shelf utilisation for mixed SKUs.
    std::sort(boxes.begin(), boxes.end(), [](const Box& a, const Box& b) {
        return (a.length_mm * a.width_mm) > (b.length_mm * b.width_mm);
    });

    std::vector<Placement> out;
    out.reserve(boxes.size());

    double cursor_x = 0.0;
    double cursor_y = 0.0;
    double shelf_depth = 0.0;

    for (const auto& box : boxes) {
        // Try both orientations (0 and 90 degrees) and keep the one that fits.
        // Prefer the orientation whose depth best matches the open shelf so we
        // waste less vertical band.
        struct Orient { double len, wid, rot; };
        Orient options[2] = {
            {box.length_mm, box.width_mm, 0.0},
            {box.width_mm, box.length_mm, 90.0},
        };

        bool placed = false;
        for (const auto& o : options) {
            if (o.len > pallet_len) continue;  // too long for the pallet at all

            // Fits in the current row?
            if (cursor_x + o.len <= pallet_len + 1e-6 &&
                cursor_y + o.wid <= pallet_wid + 1e-6) {
                out.push_back({box.sku_id, cursor_x, cursor_y, base_z,
                               o.len, o.wid, box.height_mm, box.weight_kg,
                               o.rot, layer_index});
                cursor_x += o.len;
                shelf_depth = std::max(shelf_depth, o.wid);
                placed = true;
                break;
            }
        }
        if (placed) continue;

        // Row full: advance to a new shelf above the current band.
        cursor_y += shelf_depth;
        cursor_x = 0.0;
        shelf_depth = 0.0;

        for (const auto& o : options) {
            if (o.len > pallet_len) continue;
            if (cursor_y + o.wid <= pallet_wid + 1e-6) {
                out.push_back({box.sku_id, cursor_x, cursor_y, base_z,
                               o.len, o.wid, box.height_mm, box.weight_kg,
                               o.rot, layer_index});
                cursor_x += o.len;
                shelf_depth = std::max(shelf_depth, o.wid);
                placed = true;
                break;
            }
        }
        // If still not placed, the box does not fit this layer; caller handles
        // it as unplaced / next layer. We simply skip it here.
    }
    return out;
}

// Full-layered pack. Groups boxes into height-similar layers (same idea as the
// Python engine) and packs each. Returns a flat placement list plus the SKUs
// that could not be placed within the height budget.
py::dict pack(const std::vector<py::dict>& boxes_in,
              double pallet_len,
              double pallet_wid,
              double max_height,
              double max_weight) {
    std::vector<Box> boxes;
    boxes.reserve(boxes_in.size());
    for (const auto& b : boxes_in) {
        boxes.push_back({
            b["sku_id"].cast<std::string>(),
            b["length_mm"].cast<double>(),
            b["width_mm"].cast<double>(),
            b["height_mm"].cast<double>(),
            b.contains("weight_kg") ? b["weight_kg"].cast<double>() : 0.0,
        });
    }

    // Group by rounded height so each layer is roughly flat (10 mm buckets).
    std::sort(boxes.begin(), boxes.end(), [](const Box& a, const Box& b) {
        return a.height_mm > b.height_mm;
    });

    std::vector<Placement> all;
    std::vector<std::string> unplaced;
    double z = 0.0;
    double total_weight = 0.0;
    int layer = 0;

    std::vector<Box> remaining = boxes;
    while (!remaining.empty()) {
        double layer_h = remaining.front().height_mm;
        if (z + layer_h > max_height + 1e-6) {
            for (const auto& b : remaining) unplaced.push_back(b.sku_id);
            break;
        }
        // Take boxes within 15% height of the layer reference.
        std::vector<Box> this_layer;
        std::vector<Box> rest;
        for (const auto& b : remaining) {
            if (b.height_mm >= layer_h * 0.85 && b.height_mm <= layer_h * 1.15) {
                this_layer.push_back(b);
            } else {
                rest.push_back(b);
            }
        }
        auto placed = pack_layer(this_layer, pallet_len, pallet_wid, layer, z);
        std::vector<std::string> placed_skus;
        for (const auto& p : placed) {
            placed_skus.push_back(p.sku_id);
            total_weight += p.weight_kg;
        }
        // Any this_layer box not placed goes back to rest for a later layer.
        for (const auto& b : this_layer) {
            bool was_placed = std::any_of(placed.begin(), placed.end(),
                [&](const Placement& p) { return p.sku_id == b.sku_id; });
            if (!was_placed) rest.push_back(b);
        }
        for (auto& p : placed) all.push_back(p);
        z += layer_h;
        layer += 1;
        remaining = rest;
        if (total_weight > max_weight) break;  // weight budget hit
    }

    // Marshal back to Python dicts matching palletizer_full.optimizer.Placement.
    py::list placements;
    for (const auto& p : all) {
        py::dict d;
        d["sku_id"] = p.sku_id;
        d["x_mm"] = p.x_mm;
        d["y_mm"] = p.y_mm;
        d["z_mm"] = p.z_mm;
        d["length_mm"] = p.length_mm;
        d["width_mm"] = p.width_mm;
        d["height_mm"] = p.height_mm;
        d["weight_kg"] = p.weight_kg;
        d["rot_deg"] = p.rot_deg;
        d["layer"] = p.layer;
        placements.append(d);
    }

    py::dict result;
    result["placements"] = placements;
    result["unplaced"] = unplaced;
    result["num_layers"] = layer;
    result["stack_height_mm"] = z;
    result["total_weight_kg"] = total_weight;
    return result;
}

}  // namespace

PYBIND11_MODULE(palletizer_native, m) {
    m.doc() = "Fast geometric shelf/skyline packer (C++17) for palletizer_full.";
    m.def("pack", &pack,
          py::arg("boxes"),
          py::arg("pallet_len") = 1219.0,
          py::arg("pallet_wid") = 1016.0,
          py::arg("max_height") = 1800.0,
          py::arg("max_weight") = 1000.0,
          "Pack boxes (list of dicts) into layered placements. Returns a dict "
          "with placements/unplaced/num_layers/stack_height_mm/total_weight_kg.");
}
