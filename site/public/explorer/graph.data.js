/*
	Loom Robotics — Architecture graph data (SINGLE SOURCE OF TRUTH)

	This is the entire content of the Interactive Architecture Explorer. Edit
	HERE to change the graph — add/rename layers or subsystems, rewrite copy,
	or wire up real images. assets/js/explorer.js reads this and renders it via
	Cytoscape; it knows nothing about specific nodes, so you never touch it to
	change content.

	STRUCTURE
	  layers[]  — the 5 system layers (Cytoscape parent/compound nodes).
	  nodes[]   — subsystems, each belonging to a layer (child nodes).
	  edges[]   — primary data-flow links (kept legible, not exhaustive).

	NODE CONTENT (shown in the side panel on click)
	  label   : short name on the graph
	  summary : one line, shown as the hover tooltip
	  detail  : a short paragraph for the side panel  (PLACEHOLDER — replace)
	  notes[] : bullet points for the side panel       (PLACEHOLDER — replace)
	  image   : { label } marks where a diagram/render will go (not yet present)

	Anything marked DRAFT below is placeholder copy to be replaced with real
	technical write-ups. Structure and wiring are final; words are not.
*/
window.LOOM_GRAPH = {

	// --- Layers (parent nodes). `flowOrder` drives the vertical command flow. ---
	layers: [
		{ id: "mission",    index: 1, name: "Mission",              summary: "High-level planning: turns a build model into releasable tasks." },
		{ id: "swarm",      index: 2, name: "Swarm Coordination",   summary: "Decentralized allocation and conflict handling across workers." },
		{ id: "autonomy",   index: 3, name: "Robot Autonomy",       summary: "Per-robot navigation, perception, and manipulation." },
		{ id: "hardware",   index: 4, name: "Hardware",             summary: "Physical compute, sensing, actuation, and power." },
		{ id: "simulation", index: 5, name: "Simulation & Training", summary: "Digital twins and synthetic data that train the autonomy stack." }
	],

	// --- Subsystems (child nodes), grouped by layer id. ---
	nodes: [
		// Layer 1 — Mission
		{ id: "dependency-graph",  layer: "mission", label: "Dependency Graph",     summary: "Generates the build-order dependency graph from the model.",
		  detail: "DRAFT — describe how the build model is parsed into a directed dependency graph that defines which steps unlock which.",
		  notes: ["DRAFT note — input model format", "DRAFT note — ordering constraints"], image: { label: "Dependency-graph diagram" } },
		{ id: "build-planning",    layer: "mission", label: "Build Planning",        summary: "Plans the overall assembly sequence and stages.",
		  detail: "DRAFT — describe staged build planning and how plans map to releasable task batches.", notes: ["DRAFT note"], image: { label: "Build-plan diagram" } },
		{ id: "instruction-parse", layer: "mission", label: "Foreman Parsing",       summary: "Foreman parses instructions into machine tasks.",
		  detail: "DRAFT — describe the supervisory Foreman parsing a digital model into buildable instructions (no real-time control).", notes: ["DRAFT note"], image: { label: "Foreman parse flow" } },
		{ id: "task-decomposition",layer: "mission", label: "Task Decomposition",    summary: "Breaks the build into discrete buildable tasks.",
		  detail: "DRAFT — describe decomposition of high-level goals into atomic, claimable tasks.", notes: ["DRAFT note"], image: { label: "Decomposition diagram" } },

		// Layer 2 — Swarm Coordination
		{ id: "task-allocation",   layer: "swarm", label: "Task Allocation",         summary: "Distributes buildable tasks across available workers.",
		  detail: "DRAFT — describe decentralized task allocation / claiming and how workers pull buildable steps.", notes: ["DRAFT note"], image: { label: "Allocation diagram" } },
		{ id: "congestion",        layer: "swarm", label: "Congestion Mgmt",         summary: "Keeps the shared workspace from gridlocking.",
		  detail: "DRAFT — describe arena congestion management and spatial scheduling.", notes: ["DRAFT note"], image: { label: "Congestion map" } },
		{ id: "conflict-res",      layer: "swarm", label: "Conflict Resolution",     summary: "Resolves competing claims and placement conflicts.",
		  detail: "DRAFT — describe how conflicting task claims and placement collisions are resolved.", notes: ["DRAFT note"], image: { label: "Conflict resolution" } },
		{ id: "negotiation",       layer: "swarm", label: "Local Negotiation",       summary: "Peer-to-peer negotiation between nearby robots.",
		  detail: "DRAFT — describe local negotiation protocols between neighboring workers.", notes: ["DRAFT note"], image: { label: "Negotiation flow" } },
		{ id: "decentralized-comms",layer: "swarm", label: "Decentralized Comms",    summary: "Minimal-broadcast communication substrate.",
		  detail: "DRAFT — describe the minimal-communication / stigmergic coordination substrate.", notes: ["DRAFT note"], image: { label: "Comms topology" } },

		// Layer 3 — Robot Autonomy
		{ id: "navigation",        layer: "autonomy", label: "Navigation",           summary: "Plans and follows routes through the arena.",
		  detail: "DRAFT — describe per-robot navigation in the shared workspace.", notes: ["DRAFT note"], image: { label: "Navigation stack" } },
		{ id: "localization",      layer: "autonomy", label: "Localization",         summary: "Estimates each robot's pose in the arena.",
		  detail: "DRAFT — describe localization approach and reference frames.", notes: ["DRAFT note"], image: { label: "Localization diagram" } },
		{ id: "slam",              layer: "autonomy", label: "SLAM",                 summary: "Builds and maintains a map while localizing.",
		  detail: "DRAFT — describe mapping / SLAM usage if applicable.", notes: ["DRAFT note"], image: { label: "SLAM map" } },
		{ id: "manipulation",      layer: "autonomy", label: "Manipulation",         summary: "Grasps, transports, and places bricks.",
		  detail: "DRAFT — describe the 4-DOF arm + gripper pick/place pipeline with verification.", notes: ["DRAFT note"], image: { label: "Manipulation pipeline" } },
		{ id: "path-planning",     layer: "autonomy", label: "Path Planning",        summary: "Computes collision-free motion to targets.",
		  detail: "DRAFT — describe path planning for base and/or arm.", notes: ["DRAFT note"], image: { label: "Path planner" } },
		{ id: "obstacle-avoidance",layer: "autonomy", label: "Obstacle Avoidance",   summary: "Reacts to dynamic obstacles and other robots.",
		  detail: "DRAFT — describe reactive obstacle avoidance among moving peers.", notes: ["DRAFT note"], image: { label: "Avoidance diagram" } },

		// Layer 4 — Hardware
		{ id: "jetson",            layer: "hardware", label: "Jetson Compute",       summary: "Onboard compute for perception and autonomy.",
		  detail: "DRAFT — describe onboard compute platform and what runs on it.", notes: ["DRAFT note"], image: { label: "Compute board" } },
		{ id: "cameras",           layer: "hardware", label: "Cameras",             summary: "Vision sensors for perception and inspection.",
		  detail: "DRAFT — describe camera setup and roles (part detection, verification).", notes: ["DRAFT note"], image: { label: "Camera layout" } },
		{ id: "actuators",         layer: "hardware", label: "Actuators",           summary: "Drive the base and the arm joints.",
		  detail: "DRAFT — describe actuators for locomotion and the arm.", notes: ["DRAFT note"], image: { label: "Actuator render" } },
		{ id: "grippers",          layer: "hardware", label: "Grippers",            summary: "End effector for handling brick geometries.",
		  detail: "DRAFT — describe gripper design and supported geometries.", notes: ["DRAFT note"], image: { label: "Gripper CAD" } },
		{ id: "power",             layer: "hardware", label: "Power",               summary: "Onboard power and energy budget.",
		  detail: "DRAFT — describe power system and runtime considerations.", notes: ["DRAFT note"], image: { label: "Power schematic" } },
		{ id: "sensors",           layer: "hardware", label: "Sensors",            summary: "Proprioceptive and environmental sensing.",
		  detail: "DRAFT — describe additional sensors beyond cameras.", notes: ["DRAFT note"], image: { label: "Sensor suite" } },
		{ id: "networking",        layer: "hardware", label: "Networking",         summary: "Links workers for decentralized coordination.",
		  detail: "DRAFT — describe the networking layer the comms substrate runs on.", notes: ["DRAFT note"], image: { label: "Network diagram" } },

		// Layer 5 — Simulation & Training
		{ id: "isaac-sim",         layer: "simulation", label: "Isaac Sim",         summary: "Physics simulation for swarm behavior.",
		  detail: "DRAFT — describe Isaac Sim usage for validating swarm behavior pre-hardware.", notes: ["DRAFT note"], image: { label: "Isaac Sim scene" } },
		{ id: "blender",           layer: "simulation", label: "Blender",           summary: "Asset and scene authoring for synthetic data.",
		  detail: "DRAFT — describe Blender's role in asset / scene generation.", notes: ["DRAFT note"], image: { label: "Blender scene" } },
		{ id: "digital-twins",     layer: "simulation", label: "Digital Twins",     summary: "Virtual replicas of the robots and arena.",
		  detail: "DRAFT — describe the digital-twin approach mirroring real hardware.", notes: ["DRAFT note"], image: { label: "Digital twin" } },
		{ id: "synthetic-data",    layer: "simulation", label: "Synthetic Data",    summary: "Generated datasets for perception training.",
		  detail: "DRAFT — describe synthetic dataset generation for perception models.", notes: ["DRAFT note"], image: { label: "Dataset sample" } },
		{ id: "rl-envs",           layer: "simulation", label: "RL Environments",   summary: "Training environments for learned policies.",
		  detail: "DRAFT — describe reinforcement-learning environments and trained policies.", notes: ["DRAFT note"], image: { label: "RL environment" } }
	],

	// --- Edges: primary command flow (down) + feedback (up), kept legible. ---
	// kind: "command" (downward task flow) | "feedback" (upward) | "train" (sim → autonomy)
	edges: [
		{ source: "mission",    target: "swarm",      kind: "command", label: "tasks" },
		{ source: "swarm",      target: "autonomy",   kind: "command", label: "assignments" },
		{ source: "autonomy",   target: "hardware",   kind: "command", label: "actuation" },
		{ source: "hardware",   target: "autonomy",   kind: "feedback", label: "sensing" },
		{ source: "autonomy",   target: "swarm",      kind: "feedback", label: "status" },
		{ source: "swarm",      target: "mission",    kind: "feedback", label: "progress" },
		{ source: "simulation", target: "autonomy",   kind: "train",   label: "trained policies" },
		{ source: "autonomy",   target: "simulation", kind: "feedback", label: "telemetry" }
	]
};
