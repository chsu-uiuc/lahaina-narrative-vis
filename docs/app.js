
// Narrative state: scene index drives everything
const state = { scene:1, monthIdx: 23, band: null};
const NSCENES = 5;

const SCENE_TEXT = {
    1: "placeholder: pre-fire West Maui, a stable resort market",
    2: "placeholder: the fire, the crash, and a strange rebound",
    3: "placeholder: the sheltering plateau, the exit, the trough",
    4: "placeholder: hotels stuck below baseline while short-term rentals near the burn zone multiply",
    5: "placeholder: explore every listing month by month",
}

Promise.all([
    d3.json("data/hotel.json"),
    d3.json("data/airbnb.json"),
    d3.json("data/map_points.json"),
    d3.json("data/burn.geojson"),
    d3.json("data/westmaui.geojson"),
]).then(([hotel, airbnb, mp, burn, coast])=> {
    // --- Shared hotel chart (scenes 1-3): built once
    const chartSvg = d3.select("#chart");
    const CHART_WIDTH = +chartSvg.attr("width");
    const CHART_HEIGHT = +chartSvg.attr("height");
    const MARGIN = {top: 60, right: 40, bottom: 40, left: 60};

    const parseM = d3.utcParse("%Y-%m");
    const parseD = d3.utcParse("%Y-%m-%d");
    // Monthly values represent the whole month: plot them at mid-month
    // so they sit on the correct side of the exact-dated event lines
    const parseMid = ym => parseD(`${ym}-15`);
    const hDates = hotel.series.map(d=> parseMid(d.m));

    const x = d3.scaleUtc().range([MARGIN.left, CHART_WIDTH - MARGIN.right]);
    const y = d3.scaleLinear()
                .domain([0, 100])
                .range([CHART_HEIGHT - MARGIN.bottom, MARGIN.top]);

    const hotelLayer = chartSvg.append("g");

    // clip so the line never draws outside the chart area
    chartSvg.append("clipPath")
        .attr("id", "plot-clip")
        .append("rect")
        .attr("x", MARGIN.left)
        .attr("y", MARGIN.top)
        .attr("width", CHART_WIDTH - MARGIN.left - MARGIN.right)
        .attr("height", CHART_HEIGHT - MARGIN.top - MARGIN.bottom);

    const xAxisG = hotelLayer.append("g")
                    .attr("transform", `translate(0,${CHART_HEIGHT - MARGIN.bottom})`);
    hotelLayer.append("g")
        .attr("transform", `translate(${MARGIN.left},0)`)
        .call(d3.axisLeft(y).tickFormat(d=> d+"%"));

    const plot = hotelLayer.append("g")
                    .attr("clip-path", "url(#plot-clip)");

    // seasonal baselines: calendar-month values mapped onto 2023 dates
    const blLine = key => d3.line()
        .x(b => x(parseMid(`2023-${String(b.month).padStart(2, "0")}`)))
        .y(b=> y(b[key]));
    // 2019 and 2022 baseline lines
    const bl19 = plot.append("path")
                    .datum(hotel.baseline)
                    .attr("fill", "none")
                    .attr("stroke", "#999")
                    .attr("stroke-dasharray", "5 4");
    const bl22 = plot.append("path")
                    .datum(hotel.baseline)
                    .attr("fill", "none")
                    .attr("stroke", "#bbb")
                    .attr("stroke-dasharray", "2 3");
    // 2019 and 2022 text
    const blLabel19 = plot.append("text")
                        .attr("font-size", 11)
                        .attr("fill", "#999")
                        .text("2019 Baseline");
    const blLabel22 = plot.append("text")
                        .attr("font-size", 11)
                        .attr("fill", "#bbb")
                        .text("2022 Baseline");
    // hotel occupancy line
    const occLine = d3.line()
                        .x((d, i) => x(hDates[i]))
                        .y(d=> y(d.occ));
    const occPath = plot.append("path")
                        .datum(hotel.series)
                        .attr("fill", "none")
                        .attr("stroke", "#c0392b")
                        .attr("stroke-width", 2.5)

    const eventG = plot.append("g");

    // Reframe the chart: slide the x domain and swap event lines.
    function frameChart(m0, m1, eventDates, showBl=true, dur=950) {
        x.domain([parseMid(m0), parseMid(m1)]);
        const t = chartSvg.transition().duration(dur).ease(d3.easeCubicOut);
        xAxisG.transition(t).call(d3.axisBottom(x));
        occPath.transition(t).attr("d", occLine);
        bl19.transition(t).attr("d", blLine("occ2019")).attr("opacity", showBl ? 1 : 0);
        bl22.transition(t).attr("d", blLine("occ2022")).attr("opacity", showBl ? 1 : 0);
        const labelM = parseM("2023-06");
        blLabel19.transition(t)
                    .attr("opacity", showBl ? 1 : 0)
                    .attr("x", x(labelM) + 4)
                    .attr("y", y(hotel.baseline[2].occ2019)+6);
        blLabel22.transition(t)
                    .attr("opacity", showBl ? 1 : 0)
                    .attr("x", x(labelM) + 4)
                    .attr("y", y(hotel.baseline[2].occ2022) +20);


        const evs = hotel.events.filter(e => eventDates.includes(e.date));
        eventG.selectAll("g.event")
            .data(evs, e=> e.date)
            .join(
                enter => {
                    const g = enter.append("g").attr("class", "event").attr("opacity", 0);
                    g.append("line")
                        .attr("y1", MARGIN.top)
                        .attr("y2", CHART_HEIGHT - MARGIN.bottom)
                        .attr("stroke", "#555")
                        .attr("stroke-dasharray", "4 3");
                    g.append("text")
                        .attr("x", 5)
                        .attr("y", MARGIN.top + 12)
                        .attr("fill", "#555")
                        .attr("font-size", 11)
                        .text(e => e.label);
                    return g;
                },
                update => update,
                exit => exit.transition(t).attr("opacity", 0).remove()
            )
            .transition(t)
            .attr("opacity", 1)
            .attr("transform", e => `translate(${x(parseD(e.date))},0)`);

        eventG.selectAll("g.event text").attr("y", (e, i)=> MARGIN.top+12+i*14);
    }

    // Annotations
    const SCENE_ANNOS = {
        1: [{
                m: "2023-04", v: 67.2, dx: 40, dy: 60,
                title: "A normal season",
                label: "Through July 2023, West Maui occupancy tracked its 2019 and 2022 seasonal patterns."
            }],
        2: [{
                m: "2023-08", v: 45.4, dx: -35, dy: 20,
                title: "45.4% Occupancy",
                label: "The worst month on record — tourism shut down after the fire."
            },
            {
                m: "2023-11", v: 73.3, dx: 5, dy: 55,
                title: "A strange rebound",
                label: "Above 2022 and 2019 — rooms filled by displaced residents, relief workers and returning visitors."
            }],
        3: [{
                m: "2024-02", v: 76.3, dx: -30, dy: -45,
                title: "76.3% plateau",
                label: "Occupancy held high while the sheltering program ran." },
            {
                m: "2024-09", v: 49.8, dx: 35, dy: 60,
                title: "49.8% trough",
                label: "Three months after the program ended, occupancy hit its post-fire low."
            }],
    };

    const annoG = hotelLayer.append("g");
    function drawAnnos(scene) {
        annoG.selectAll("*").remove();
        const list = SCENE_ANNOS[scene] || [];
        if (!list.length) return;
        const maker = d3.annotation()
            .type(d3.annotationCalloutCircle)
            .annotations(list.map(a => ({
                x: x(parseMid(a.m)), y: y(a.v),
                dx: a.dx, dy: a.dy,
                note: { title: a.title, label: a.label, wrap: 190 },
                subject: { radius: 5 },
            })));
        // fade in after the reframe transition has mostly settled
        annoG.attr("opacity", 0).call(maker)
            .transition().delay(500).duration(300).attr("opacity", 1);
    }


    // --- Scene 4 - The divergence (two panels, one time axis) ---
    // Diff units (% vs listing count) -< stacked panels
    let drawS4Annos;
    const s4 = chartSvg.append("g").style("display", "none");
    {
        // first month with a clean post-fire ltm window
        const START = "2024-08"
        const hSer = hotel.series.filter(d=>d.m >= START);
        const i0 = airbnb.months.indexOf(START);
        const aCounts = airbnb.bands["0-1km"].slice(i0);
        const aDates = airbnb.months.slice(i0).map(parseM);

        const x4 = d3.scaleUtc()
                        .domain([parseM(START), parseM("2026-07")])
                        .range([MARGIN.left, CHART_WIDTH - MARGIN.right]);
        const yTop = d3.scaleLinear()
                        .domain([0, 100])
                        .range([220, 70]);
        const yBot = d3.scaleLinear()
                        .domain([0, 130])
                        .range([460, 310]);

        // top panel: hotel occupancy vs the 2019 seasonal norm
        s4.append("text")
            .attr("x", MARGIN.left)
            .attr("y", 60)
            .attr("font-size", 13)
            .attr("font-weight", 600)
            .text("Hotel Occupancy, West Maui (vs 2019 seasonal norm, dashed)");
        s4.append("g")
            .attr("transform", `translate(${MARGIN.left},0)`)
            .call(d3.axisLeft(yTop).ticks(4).tickFormat(d=> d+"%"));
        s4.append("path")
            .datum(hSer)
            .attr("fill", "none")
            .attr("stroke", "#7f8c8d")
            .attr("stroke-width", 2)
            .attr("d", d3.line()
                .x(d => x4(parseMid(d.m)))
                .y(d => yTop(d.occ))
            );
        s4.append("path")
            .datum(hSer)
            .attr("fill", "none")
            .attr("stroke", "#999")
            .attr("stroke-dasharray", "5 4")
            .attr("d", d3.line()
                .x(d => x4(parseMid(d.m)))
                .y(d => yTop(hotel.baseline[+d.m.slice(5) - 1 ].occ2019))
            );

        // bottom panel: active listings within 1km of the burn zone
        s4.append("text")
            .attr("x", MARGIN.left)
            .attr("y", 295)
            .attr("font-size", 13)
            .attr("font-weight", 600)
            .text("Active Listings within 1km of the burn zone");
        s4.append("g")
            .attr("transform", `translate(${MARGIN.left},0)`)
            .call(d3.axisLeft(yBot).ticks(4));
        s4.append("g")
            .attr("transform", `translate(0,460)`)
            .call(d3.axisBottom(x4));
        s4.append("path")
            .datum(aCounts)
            .attr("fill", "none")
            .attr("stroke", "#c0392b")
            .attr("stroke-width", 2.5)
            .attr("d", d3.line()
                .x((d, i) => x4(aDates[i]))
                .y(d => yBot(d))
            );
        s4.append("text")
            .attr("x", x4(aDates[aDates.length - 1]) - 8)
            .attr("y", yBot(aCounts[aCounts.length - 1]) - 8)
            .attr("fill", "#c0392b")
            .attr("font-weight", 600)
            .text(aCounts[aCounts.length -1]);

        const s4annoG = s4.append("g");
        drawS4Annos = () => {
            s4annoG.selectAll("*").remove();
            s4annoG.call(d3.annotation()
                .type(d3.annotationCalloutCircle)
                .annotations([
                    {
                        x: x4(parseM("2024-08")),
                        y: yBot(5), dx: 40, dy: -40,
                        note: {
                            title: "5 listings",
                            label: "Active within 1 km of the burn zone, Aug 2024.",
                            wrap: 160 },
                        subject: { radius: 5 } },
                    {
                        x: x4(parseM("2026-02")),
                        y: yTop(76.3), dx: -50, dy: -30,
                        note: { label: "Only the 2026 peak season touched the 2019 norm.",
                        wrap: 160 },
                        subject: { radius: 5 } },
                ]));
        };

    }

    // --- Scene 5 - Exploration map
    const mapSvg = d3.select("#map");
    const MAP_WIDTH = +mapSvg.attr("width");
    const MAP_HEIGHT = +mapSvg.attr("height");
    const ptsGeo = {
        type: "MultiPoint",
        coordinates: mp.pts.map(p=> [p[0], p[1]])
    }
    const proj = d3.geoMercator().fitExtent([[20, 20], [MAP_WIDTH -20, MAP_HEIGHT -20]], ptsGeo);
    const geoPath = d3.geoPath(proj);
    const mapG = mapSvg.append("g");

    mapG.append("path")
            .datum(coast)
            .attr("fill", "#f2f0eb")
            .attr("stroke", "#999")
            .attr("d", geoPath);
    mapG.append("path")
            .datum(burn)
            .attr("fill", "#c0392b")
            .attr("fill-opacity", 0.25)
            .attr("stroke", "#c0392b")
            .attr("d", geoPath);

    const bandColor = d3.scaleOrdinal()
                        .domain(d3.range(mp.bands.length))
                        .range(["#7b241c", "#c0392b", "#e67e22",
                            "#b7950b", "#7f8c8d", "#bdc3c7"]);

    // Map Legend: one swatch per distance band adn the burn area
    const legend = d3.select("#map-legend");
    mp.bands.forEach((b, i)=>{
        const item = legend.append("span").attr("class", "legend-item");
        item.append("span")
                .attr("class", "legend-swatch")
                .style("background", bandColor(i));
        item.append("span").text(b);
    });

    const burnItem = legend.append("span").attr("class", "legend-item");
    burnItem.append("span")
                .attr("class", "legend-swatch")
                .style("background", "rgba(192,57,43,0.25)")
                .style("border", "1px solid #c0392b")
                .style("border-radius", "2px");
    burnItem.append("span").text("burned area (2023 fire)");

    // Tooltip for map interactions
    const tip = d3.select("#tooltip");
    const dots = mapG.append("g").selectAll("circle")
                        .data(mp.pts)
                        .join("circle")
                        .attr("cx", p=> proj([p[0], p[1]])[0])
                        .attr("cy", p=> proj([p[0], p[1]])[1])
                        .attr("r",3)
                        .attr("fill", p=> bandColor(p[2]))
                        .attr("fill-opacity", 0.6)
                        .on("pointerover", (ev, p)=> {
                            tip.style("display", "block")
                                .style("left", (ev.pageX+12) + "px")
                                .style("top", (ev.pageY-10) + "px")
                                .html(`Band: ${mp.bands[p[2]]}<br>` +
                                    `Active ${p[3].split("").filter(c=>c === "1").length} of 24 months`
                                );
                        })
                        .on("pointerout", ()=> {
                            tip.style("display", "none");
                        });

    // Update the map
    const CLEAN0 = mp.months.indexOf("2024-08");
    function updateMap() {
        const warn = state.monthIdx < CLEAN0
                            ? " (review window still includes pre-fire months" : "";
        d3.select("#month-label").text("  " + mp.months[state.monthIdx] + warn);
        dots.attr("display", p=> p[3][state.monthIdx] === "1" ? null : "none");
        // wheel zoom + drag pan
        mapSvg.call(d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", (event) => {
                mapG.attr("transform", event.transform);
            })
        )
        // Area labels (approx. coordinates)
        const PLACES = [
            { name: "Kapalua",      lon: -156.666, lat: 21.000 },
            { name: "Nāpili",       lon: -156.678, lat: 20.994 },
            { name: "Kāʻanapali",   lon: -156.695, lat: 20.923 },
            { name: "Lahaina town", lon: -156.679, lat: 20.878 },
            { name: "Olowalu",      lon: -156.620, lat: 20.811 },
        ];
        mapG.append("g").selectAll("text")
            .data(PLACES)
            .join("text")
            .attr("x", d => proj([d.lon, d.lat])[0] + 8)
            .attr("y", d => proj([d.lon, d.lat])[1])
            .attr("font-size", 11)
            .attr("fill", "#333")
            .attr("border", "2px solid #ccc")
            .attr("text-anchor", "start")
            .text(d => d.name);
        }
         // Region-tier labels (cartographic convention: caps + letterspacing)
        const REGIONS = [
            { name: "WEST MAUI",          lon: -156.590, lat: 20.885 },
        ];
        mapG.append("g").selectAll("text")
            .data(REGIONS)
            .join("text")
            .attr("x", d => proj([d.lon, d.lat])[0])
            .attr("y", d => proj([d.lon, d.lat])[1])
            .attr("text-anchor", "middle")
            .attr("font-size", 38)
            .attr("letter-spacing", "0.25em")
            .attr("fill", "#bbb")
            .text(d => d.name);


    // --- Scene renderers ---
    const RENDERERS = {
        1: () => {frameChart("2023-01", "2023-07", []); drawAnnos(1); },
        2: () => {frameChart("2023-01", "2024-02",
               ["2023-08-08", "2023-10-08"]); drawAnnos(2); },
        3: () => { frameChart("2023-01", "2026-05",
               ["2024-05-13", "2024-06-10"], false); drawAnnos(3);},
        4: () => drawS4Annos(),
        5: updateMap,
    };

    function render() {
        d3.select("#scene-label").text(`Scene ${state.scene} / ${NSCENES}`);
        d3.select("#scene-text").text(SCENE_TEXT[state.scene]);
        // Disables navigation buttons based on scene
        d3.select("#prev").attr("disabled", state.scene === 1 ? true : null);
        d3.select("#next").attr("disabled", state.scene === NSCENES ? true : null);
        // Scene 5 swaps the chart for the map
        d3.select("#chart").style("display", state.scene === 5 ? "none" : null);
        d3.select("#map").style("display", state.scene === 5 ? null : "none");
        hotelLayer.style("display", state.scene <= 3 ? null : "none");
        s4.style("display", state.scene === 4 ? null : "none");
        d3.select("#map-ui").style("display", state.scene === 5 ? null : "none");
        RENDERERS[state.scene]();
    }

    // --- Triggers ---
    d3.select("#next").on("click", ()=> {
        state.scene = Math.min(NSCENES, state.scene +1);
        render();
    });
    d3.select("#prev").on("click", ()=> {
        state.scene = Math.max(1, state.scene -1);
        render();
    });
    d3.select("#month-slider").on("input", function() {
        state.monthIdx = +this.value;
        updateMap();
    })
    render();
});
