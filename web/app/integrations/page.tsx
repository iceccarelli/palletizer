"use client";

import React from "react";
import Link from "next/link";

export default function IntegrationsPage() {
  return (
    <main className="pt-28 pb-24">
      <section className="max-w-4xl mx-auto px-6">
        <div className="uppercase tracking-[4px] text-[11px] text-emerald-400 mb-2">
          ROS 2 + LiDAR
        </div>
        <h1 className="text-5xl md:text-6xl font-semibold tracking-tighter leading-[1.05]">
          Closing the loop from
          <br />
          browser to robot cell
        </h1>
        <p className="mt-5 text-lg text-white/70 max-w-2xl">
          The design goal: the deterministic optimizer that runs the public demos is the same one
          wrapped by a ROS 2 node, with LiDAR perception feeding real-world state back into the
          planner. The code below is reference material — it hasn&apos;t been run against a certified
          production cell.
        </p>
      </section>

      <section className="max-w-5xl mx-auto px-6 mt-16 space-y-16">
        <div>
          <h3 className="font-mono text-[11px] tracking-[3px] text-emerald-400 mb-3">ARCHITECTURE</h3>
          <p className="text-white/80">
            The same <code>PalletiserOrchestrator</code> and <code>ConstructionPalletOptimizer</code>{" "}
            used in the website demos are wrapped by a ROS 2 node. LiDAR perception is intended to
            feed state back into the planner for adaptive re-planning.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <div className="border border-white/10 rounded-3xl p-8 bg-white/[0.03]">
            <div className="font-medium mb-4">LiDAR perception layer (reference)</div>
            <ul className="text-sm space-y-2 text-white/70 list-disc pl-5">
              <li>Point-cloud processing (Open3D)</li>
              <li>Pallet pose estimation on uneven surfaces</li>
              <li>Load-shift detection between picks → safety pause + re-plan</li>
              <li>Floor-flatness mapping for tall stacks</li>
              <li>Fallback to 2D LiDAR / depth camera</li>
            </ul>
          </div>
          <div className="border border-white/10 rounded-3xl p-8 bg-white/[0.03]">
            <div className="font-medium mb-4">ROS 2 integration (reference)</div>
            <ul className="text-sm space-y-2 text-white/70 list-disc pl-5">
              <li>rclpy node with action servers for long-running missions</li>
              <li>Bridge stubs for common arms and mobile bases (nav2)</li>
              <li>Trajectory / MoveIt goal generation from plans</li>
              <li>Telemetry back to the gateway / on-prem orchestrator</li>
              <li>Safety interlocks tied to perception confidence + stability score</li>
            </ul>
          </div>
        </div>

        <div>
          <h3 className="font-mono text-[11px] tracking-[3px] text-emerald-400 mb-3">
            ILLUSTRATIVE USAGE
          </h3>
          <p className="text-sm text-white/55 mb-4">
            Target shape of the interface once wired into a ROS 2 workspace. See{" "}
            <code>ros2_integration/README.md</code> for what actually runs today versus what is
            still stubbed.
          </p>
          <pre className="bg-black p-6 rounded-2xl text-xs overflow-auto border border-white/10">
            <code>{`# In a ROS 2 workspace, after adding ros2_integration to your build
ros2 run ros2_integration palletizer_construction_node \\
  --ros-args -p robot_type:=kuka -p use_lidar:=true

# Trigger a plan from any ROS node or WMS bridge
ros2 topic pub /palletizer/command std_msgs/String \\
  "data: '{\\"action\\":\\"optimize_and_execute\\",\\"skus\\":[{\\"sku_id\\":\\"DRY-4x8-HALF\\"}],\\"quantities\\":[32]}'"`}</code>
          </pre>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link
            href="https://github.com/iceccarelli/palletizer"
            target="_blank"
            className="px-6 py-3 border border-white/25 rounded-2xl text-sm font-medium hover:bg-white/5"
          >
            Read the ROS 2 reference code →
          </Link>
          <Link href="/contact" className="px-6 py-3 bg-white text-black rounded-2xl text-sm font-medium">
            Request a pilot
          </Link>
        </div>
      </section>

      <section className="border-t border-white/10 mt-20 py-10 text-center text-sm text-white/45">
        Full source in <code>ros2_integration/</code>. Digital-twin and managed connectors are on the
        roadmap, not available today.
      </section>
    </main>
  );
}
