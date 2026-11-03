/*
	Necto Robotics — Architecture Explorer

	Our interface around the graph. Cytoscape.js (vendored, pinned 3.30.2) is a
	dependency behind this file — it is never used directly by a page. Content
	comes entirely from assets/js/graph.data.js (window.NECTO_GRAPH); this file
	only knows how to *render and interact*, not what the nodes are.

	Expected DOM (provided by architecture.html):
		#arch-explorer            — graph canvas mount
		#arch-legend              — legend list (populated here from layers)
		#arch-controls [data-action=zoom-in|zoom-out|fit|reset]
		#arch-panel  / #arch-panel-title / #arch-panel-body / [data-action=close]

	If Cytoscape or the data is missing, we bail quietly — the page's <noscript>
	/ Technical Overview fallback remains the source of truth.
*/
(function () {
	"use strict";

	var G = window.NECTO_GRAPH;
	var mount = document.getElementById("arch-explorer");
	if (!mount || !G || typeof cytoscape === "undefined") { return; }

	var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
	var isMobile = function () { return window.matchMedia("(max-width: 736px)").matches; };

	/* --- Brand tokens (read once from CSS so colors stay single-sourced) --- */
	function token(name, fallback) {
		var v = getComputedStyle(document.documentElement).getPropertyValue(name);
		return (v && v.trim()) || fallback;
	}
	var C = {
		charcoal: token("--charcoal", "#15191e"),
		graphite: token("--graphite", "#252b33"),
		line:     token("--graphite-line", "#323a44"),
		offwhite: token("--offwhite", "#f3f4f5"),
		orange:   token("--orange", "#ff6a13"),
		steel:    token("--steel", "#5b7a99")
	};

	/* Per-layer accent — the ONE place to recolor layers. A monochrome ramp,
	   dim to bright, encoding planning(top) → physical(bottom). */
	var ACCENTS = {
		mission:    "#7d8288",
		swarm:      "#9aa0a6",
		autonomy:   "#c3c7cb",
		hardware:   "#ffffff",
		simulation: "#5d6267"
	};
	var accentOf = function (layerId) { return ACCENTS[layerId] || C.steel; };

	/* --- Build Cytoscape elements from our data --- */
	var nodeById = {};
	G.nodes.forEach(function (n) { nodeById[n.id] = n; });
	var layerById = {};
	G.layers.forEach(function (l) { layerById[l.id] = l; });

	function buildElements() {
		var els = [];
		G.layers.forEach(function (l) {
			els.push({ data: { id: l.id, label: "Layer " + l.index + " — " + l.name, kind: "layer", layer: l.id } });
		});
		G.nodes.forEach(function (n) {
			els.push({ data: { id: n.id, parent: n.layer, label: n.label, kind: "node", layer: n.layer } });
		});
		G.edges.forEach(function (e) {
			els.push({ data: { id: e.source + "__" + e.target, source: e.source, target: e.target, kind: e.kind, label: e.label } });
		});
		return els;
	}

	/* --- Preset layout: layers as stacked horizontal bands --- */
	var BAND_H = 210, COL_W = 175;
	function presetPositions() {
		var pos = {};
		G.layers.forEach(function (l, i) {
			var children = G.nodes.filter(function (n) { return n.layer === l.id; });
			var y = i * BAND_H;
			children.forEach(function (n, j) {
				pos[n.id] = { x: (j - (children.length - 1) / 2) * COL_W, y: y };
			});
		});
		return pos;
	}
	var POS = presetPositions();

	/* --- Cytoscape stylesheet (brand-styled) --- */
	function stylesheet() {
		return [
			{ selector: "node[kind='layer']", style: {
				"background-color": "rgba(37,43,51,0.35)",
				"background-opacity": 1,
				"border-width": 1, "border-color": C.line, "border-style": "dashed",
				"shape": "round-rectangle", "padding": "16px",
				"label": "data(label)", "text-valign": "top", "text-halign": "center",
				"font-family": "Inter Tight Variable, Inter Tight, sans-serif", "font-size": 11, "font-weight": 600,
				"text-transform": "uppercase", "text-margin-y": -6,
				"color": function (ele) { return accentOf(ele.data("layer")); },
				"text-opacity": 0.9
			}},
			{ selector: "node[kind='node']", style: {
				"background-color": C.graphite,
				"border-width": 1.5,
				"border-color": function (ele) { return accentOf(ele.data("layer")); },
				"shape": "round-rectangle", "width": 130, "height": 46,
				"label": "data(label)", "text-valign": "center", "text-halign": "center",
				"text-wrap": "wrap", "text-max-width": 116,
				"font-family": "Inter Variable, Inter, sans-serif", "font-size": 11, "color": C.offwhite,
				"transition-property": "border-color, border-width, background-color, opacity",
				"transition-duration": "140ms"
			}},
			{ selector: "edge", style: {
				"width": 2, "curve-style": "bezier",
				"line-color": C.line, "target-arrow-color": C.line,
				"target-arrow-shape": "triangle", "arrow-scale": 0.9, "opacity": 0.55
			}},
			{ selector: "edge[kind='command']", style: { "line-color": C.steel, "target-arrow-color": C.steel } },
			{ selector: "edge[kind='feedback']", style: { "line-style": "dashed", "width": 1.5, "opacity": 0.35 } },
			{ selector: "edge[kind='train']", style: { "line-color": C.orange, "target-arrow-color": C.orange, "line-style": "dashed" } },

			/* interaction states */
			{ selector: ".faded", style: { "opacity": 0.12 } },
			{ selector: "node.hl", style: { "border-color": C.orange, "border-width": 2.5 } },
			{ selector: "node[kind='layer'].hl", style: { "border-style": "solid", "border-color": C.orange } },
			{ selector: "edge.hl", style: { "line-color": C.orange, "target-arrow-color": C.orange, "opacity": 1, "width": 3 } },
			{ selector: "node:selected", style: { "border-color": C.orange, "border-width": 3 } }
		];
	}

	var cy = cytoscape({
		container: mount,
		elements: buildElements(),
		style: stylesheet(),
		layout: { name: "preset", positions: POS, fit: true, padding: 40 },
		minZoom: 0.3, maxZoom: 2.5,
		boxSelectionEnabled: false
	});

	/* --- Tooltip (hover summary) --- */
	var tip = document.createElement("div");
	tip.className = "arch-tip"; tip.setAttribute("role", "status");
	mount.appendChild(tip);
	function showTip(text, rp) {
		if (!text) { return hideTip(); }
		tip.textContent = text;
		tip.style.left = rp.x + "px"; tip.style.top = (rp.y - 14) + "px";
		tip.classList.add("is-on");
	}
	function hideTip() { tip.classList.remove("is-on"); }

	/* --- Hover: illuminate neighborhood, dim the rest --- */
	function highlight(node) {
		var hood = node.closedNeighborhood();
		// include the node's layer parent + that layer's edges for legible flow
		if (node.data("kind") === "node") {
			var parent = cy.getElementById(node.data("layer"));
			hood = hood.union(parent).union(parent.connectedEdges()).union(parent.connectedEdges().connectedNodes());
		}
		cy.elements().addClass("faded");
		hood.removeClass("faded").addClass("hl");
		hood.nodes().removeClass("faded");
		if (!reduceMotion) { animateEdges(hood.edges().filter("[kind]")); }
	}
	function clearHighlight() {
		cy.elements().removeClass("faded hl");
		stopEdgeAnim();
	}

	cy.on("mouseover", "node", function (evt) {
		var n = evt.target;
		var content = nodeById[n.id()] || layerById[n.id()];
		var summary = content && content.summary;
		highlight(n);
		showTip(summary, evt.renderedPosition || n.renderedPosition());
		mount.style.cursor = "pointer";
	});
	cy.on("mousemove", "node", function (evt) {
		if (tip.classList.contains("is-on")) {
			var rp = evt.renderedPosition; tip.style.left = rp.x + "px"; tip.style.top = (rp.y - 14) + "px";
		}
	});
	cy.on("mouseout", "node", function () { clearHighlight(); hideTip(); mount.style.cursor = "default"; });

	/* --- Edge pulse (directional dash), active edges only, motion-guarded --- */
	var animRAF = null, dashOffset = 0;
	function animateEdges(edges) {
		stopEdgeAnim();
		if (!edges || edges.length === 0) { return; }
		edges.style({ "line-style": "dashed", "line-dash-pattern": [6, 6] });
		var step = function () {
			dashOffset = (dashOffset - 0.6);
			edges.style("line-dash-offset", dashOffset);
			animRAF = requestAnimationFrame(step);
		};
		animRAF = requestAnimationFrame(step);
	}
	function stopEdgeAnim() { if (animRAF) { cancelAnimationFrame(animRAF); animRAF = null; } }

	/* --- Click → side panel --- */
	var panel = document.getElementById("arch-panel");
	var panelTitle = document.getElementById("arch-panel-title");
	var panelBody = document.getElementById("arch-panel-body");

	function esc(s) { var d = document.createElement("div"); d.textContent = s == null ? "" : s; return d.innerHTML; }

	function openPanelForNode(n) {
		if (!panel) { return; }
		var layer = layerById[n.layer];
		var html = "";
		html += '<span class="arch-panel-layer" style="color:' + accentOf(n.layer) + '">Layer ' + layer.index + " — " + esc(layer.name) + "</span>";
		// Unwritten copy is marked DRAFT in graph.data.js; never show it. Fall
		// back to the node's one-line summary, and skip placeholder media.
		var written = function (x) { return x && !/^DRAFT/.test(x); };
		html += "<p>" + esc(written(n.detail) ? n.detail : n.summary) + "</p>";
		var notes = (n.notes || []).filter(written);
		if (notes.length) {
			html += "<ul>" + notes.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>";
		}
		panelTitle.textContent = n.label;
		panelBody.innerHTML = html;
		panel.classList.add("is-open");
	}
	function openPanelForLayer(l) {
		if (!panel) { return; }
		var subs = G.nodes.filter(function (n) { return n.layer === l.id; });
		var html = '<span class="arch-panel-layer" style="color:' + accentOf(l.id) + '">Layer ' + l.index + "</span>";
		html += "<p>" + esc(l.summary) + "</p>";
		html += '<p class="text-steel">Subsystems — tap one on the map for detail:</p>';
		html += "<ul>" + subs.map(function (s) { return "<li>" + esc(s.label) + "</li>"; }).join("") + "</ul>";
		panelTitle.textContent = l.name;
		panelBody.innerHTML = html;
		panel.classList.add("is-open");
	}
	function closePanel() { if (panel) { panel.classList.remove("is-open"); cy.$(":selected").unselect(); } }

	cy.on("tap", "node[kind='node']", function (evt) { openPanelForNode(nodeById[evt.target.id()]); });
	cy.on("tap", "node[kind='layer']", function (evt) { openPanelForLayer(layerById[evt.target.id()]); });
	cy.on("tap", function (evt) { if (evt.target === cy) { closePanel(); } });

	document.addEventListener("keydown", function (e) { if (e.key === "Escape") { closePanel(); } });
	if (panel) {
		panel.querySelectorAll('[data-action="close"]').forEach(function (b) {
			b.addEventListener("click", closePanel);
		});
	}

	/* --- Controls: zoom / fit / reset --- */
	var controls = document.getElementById("arch-controls");
	function fitAll() { cy.animate({ fit: { padding: 40 }, duration: reduceMotion ? 0 : 250 }); }
	if (controls) {
		controls.addEventListener("click", function (e) {
			var btn = e.target.closest("[data-action]"); if (!btn) { return; }
			var a = btn.getAttribute("data-action");
			if (a === "zoom-in")  { cy.zoom({ level: cy.zoom() * 1.25, renderedPosition: { x: mount.clientWidth / 2, y: mount.clientHeight / 2 } }); }
			if (a === "zoom-out") { cy.zoom({ level: cy.zoom() * 0.8,  renderedPosition: { x: mount.clientWidth / 2, y: mount.clientHeight / 2 } }); }
			if (a === "fit")      { fitAll(); }
			if (a === "reset")    { clearHighlight(); closePanel(); fitAll(); }
			if (a === "expand")   { toggleFullscreen(); }
		});
	}

	/* --- Full screen: the graph is dense, and inside a text column the detail
	   panel covers half of it. Pages without an expand button are unaffected. --- */
	var stage = mount.closest(".arch-stage");
	var expandBtn = controls ? controls.querySelector('[data-action="expand"]') : null;
	function setFullscreen(on) {
		if (!stage) { return; }
		stage.classList.toggle("is-fullscreen", on);
		// Both elements: which one actually scrolls varies, and locking only
		// <body> lets the page slide around behind the overlay.
		document.body.classList.toggle("arch-locked", on);
		document.documentElement.classList.toggle("arch-locked", on);
		if (expandBtn) {
			expandBtn.setAttribute("aria-pressed", on ? "true" : "false");
			expandBtn.title = on ? "Exit full screen" : "Expand to full screen";
		}
		// The stage changed size under Cytoscape; it has to be told.
		cy.resize();
		fitAll();
	}
	function toggleFullscreen() { setFullscreen(!stage || !stage.classList.contains("is-fullscreen")); }
	document.addEventListener("keydown", function (e) {
		if (e.key !== "Escape" || !stage || !stage.classList.contains("is-fullscreen")) { return; }
		setFullscreen(false);
		if (expandBtn) { expandBtn.focus(); }
	});

	/* --- Legend: built from layers; click isolates that layer --- */
	var legend = document.getElementById("arch-legend");
	var isolated = null;
	function renderLegend() {
		if (!legend) { return; }
		legend.innerHTML = G.layers.map(function (l) {
			return '<li><button type="button" data-layer="' + l.id + '">' +
				'<span class="sw" style="background:' + accentOf(l.id) + '"></span>' +
				"Layer " + l.index + " · " + esc(l.name) + "</button></li>";
		}).join("");
		legend.addEventListener("click", function (e) {
			var b = e.target.closest("[data-layer]"); if (!b) { return; }
			var id = b.getAttribute("data-layer");
			if (isolated === id) { isolated = null; cy.elements().removeClass("faded"); legend.querySelectorAll("button").forEach(function (x){x.classList.remove("is-active");}); return; }
			isolated = id;
			legend.querySelectorAll("button").forEach(function (x){ x.classList.toggle("is-active", x === b); });
			var keep = cy.getElementById(id).union(cy.getElementById(id).children()).union(cy.getElementById(id).connectedEdges());
			cy.elements().addClass("faded"); keep.removeClass("faded");
		});
	}
	renderLegend();

	/* --- Responsive: collapse subsystems on small screens --- */
	function applyResponsive() {
		var collapsed = isMobile();
		cy.batch(function () {
			cy.nodes("[kind='node']").style("display", collapsed ? "none" : "element");
			// when collapsed, give layer nodes a real size so they're tappable
			cy.nodes("[kind='layer']").style(collapsed
				? { "min-width": 200, "min-height": 60, "text-valign": "center", "text-margin-y": 0, "background-opacity": 1, "background-color": C.graphite }
				: { "text-valign": "top", "text-margin-y": -6, "background-color": "rgba(37,43,51,0.35)" });
		});
		fitAll();
	}
	applyResponsive();
	var rT; window.addEventListener("resize", function () { clearTimeout(rT); rT = setTimeout(applyResponsive, 200); });

	// expose a tiny handle for debugging/extension (our interface, not Cytoscape's)
	window.NectoExplorer = { cy: cy, fit: fitAll, isolate: function (id) { isolated = null; renderLegend(); } };
})();
