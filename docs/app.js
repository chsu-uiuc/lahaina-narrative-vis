
// Narrative state: scene index drives everything
const state = { scene:1, monthIdx: 23, band: null};
const NSCENES = 5;

// Annotations
const SCENE_ANNOS = {
    1: [{
            m: "2023-03", v: 74, dx: 50, dy: 80,
            title: "A normal season",
            label: "Through July 2023, West Maui occupancy tracked its 2019 and 2022 seasonal patterns."
        }],
    2: [{
            m: "2023-08", v: 45.4, dx: -35, dy: 20,
            title: "45.4% occupancy",
            label: "August 2023 was the worst month on record: tourism shut down after the fire."
        },
        {
            m: "2023-11", v: 73.3, dx: 5, dy: 55,
            title: "A strange rebound",
            label: "By November 2023, occupancy was back above both 2022 and 2019 \u2014 rooms filled by displaced residents, relief workers and returning visitors."
        }],
    3: [{
            m: "2024-02", v: 76.3, dx: -20, dy: 155,
            title: "76.3% plateau",
            label: "Occupancy held high into February 2024, while the sheltering program ran." },
        {
            m: "2024-09", v: 49.8, dx: 65, dy: 60,
            title: "49.8% trough",
            label: "September 2024, three months after the program ended: the post-fire low."
    }],
};

// Scene text
const SCENE_TEXT = {
    1: "West Maui runs on tourism: the Lahaina\u2013K\u0101\u2018anapali\u2013Kapalua strip is one "+
    "of Hawai\u2018i's densest resort corridors. Through July 2023, its hotels were having " +
    "an ordinary year, tracking the same seasonal rhythm as 2019 and 2022.",

    2: "On August 8, the fire destroyed most of Lahaina town. Occupancy fell to 45.4% \u2014 " +
    "the worst month on record \u2014 and West Maui closed to visitors. Then something odd: " +
    "by November occupancy was back above both baselines, though tourism had barely begun " +
    "its phased reopening. HTA's own reports explain who was in the rooms: a mix of "+
    "displaced residents, relief workers, and visitors.",

    3: "A FEMA and State sheltering program was paying for those rooms \u2014 3,071 households " +
    "at its peak. Occupancy held near 76% through the winter, then slid as families moved " +
    "out; the program ended on June 10, 2024, and three months later occupancy hit 49.8%, " +
    "its lowest point since the fire itself. But hotels are only half the story.",

    4: "Since August 2024, hotel occupancy has stayed below its 2019 norm in all 22 " +
    "months. Over the same two years, active Airbnb listings within 1 km of the burn zone " +
    "grew from 5 to 123 \u2014 a twenty-five-fold increase. The market recovered \u2014 " +
    "just not as the same market.",

    5: "Now explore it yourself. Each dot is one Airbnb listing, colored by its distance " +
    "to the burned area; drag the slider to move through time, zoom and hover for details. " +
    "Months before August 2024 still carry pre-fire activity in their review window \u2014 "+
    "read them with care.",
};


// Short labels for the viertical event lines
const EVENT_SHORT = {
    "2023-08-08": "Lahaina wildfire \u24D8",
    "2023-10-08": "Tourism reopening begins \u24D8",
    "2024-05-13": "85% moved out of hotels \u24D8",
    "2024-06-10": "Sheltering program ends \u24D8",
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
        .call(d3.axisLeft(y).ticks(5).tickFormat(d =>d + "%")
            .tickSize(-(CHART_WIDTH-MARGIN.left-MARGIN.right)))
        .call(g=>g.select(".domain").remove())
        .call(g=>g.selectAll(".tick line")
            .attr("stroke", "#e8e8e8"))
        .call(g=>g.selectAll(".tick text")
            .attr("fill", "#666")
            .attr("font-size", 12));

    const plot = hotelLayer.append("g")
                    .attr("clip-path", "url(#plot-clip)");

    // Tile the 12month seasonal baseline across all months
    const blLine = key => d3.line()
        .x((d,i) => x(hDates[i]))
        .y(d=> y(hotel.baseline[+d.m.slice(5,7)-1][key]));
    // 2019 and 2022 baseline lines
    const bl19 = plot.append("path")
                    .datum(hotel.series)
                    .attr("fill", "none")
                    .attr("stroke", "#aaa")
                    .attr("stroke-dasharray", "5 4");
    const bl22 = plot.append("path")
                    .datum(hotel.series)
                    .attr("fill", "none")
                    .attr("stroke", "#ccc")
                    .attr("stroke-dasharray", "2 3");
    // 2019 and 2022 text
    const blLabel19 = plot.append("text")
                        .attr("font-size", 11)
                        .attr("fill", "#aaa")
                        .attr("stroke", "#f7f7f7")
                        .attr("stroke-width", 4)
                        .attr("paint-order", "stroke")
                        .text("2019 Baseline");
    const blLabel22 = plot.append("text")
                        .attr("font-size", 11)
                        .attr("fill", "#ccc")
                        .attr("stroke", "#f7f7f7")
                        .attr("stroke-width", 4)
                        .attr("paint-order", "stroke")
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

    // --- Scene 1-3 framing function ---

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
        const EVENT_LEFT = new Set(["2024-05-13"]);
        // format dates for the tooltip
        const fmtD = d3.utcFormat("%B %-d, %Y");
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
                        .attr("x", e => EVENT_LEFT.has(e.date) ? -5 : 5)
                        .attr("text-anchor", e=> EVENT_LEFT.has(e.date) ? "end" : "start")
                        .attr("y", MARGIN.top + 12)
                        .attr("fill", "#555")
                        .attr("font-size", 11)
                        .text(e => EVENT_SHORT[e.date] || e.label);
                    g.style("cursor", "help")
                        .on("pointerover", (ev, e) => {
                            d3.select("#tooltip")
                                .style("display", "block")
                                .style("left", (ev.pageX+12) + "px")
                                .style("top", (ev.pageY-10) + "px")
                                .html(`<b>${fmtD(parseD(e.date))}</b> \u2014 ${e.label}<br>
                                    <span style="color:#888; margin-top:16px;">
                                    Source: ${e.src}</span>`
                                );
                        })
                        .on("pointerout", () => {
                            d3.select("#tooltip")
                                .style("display", "none");
                        });

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
                note: { title: a.title, label: a.label, wrap: 200 },
                subject: { radius: 5 },
            })));
        // fade in after the reframe transition has mostly settled
        annoG.attr("opacity", 0).call(maker)
            .transition().delay(500).duration(300).attr("opacity", 1);
    }

    hotelLayer.append("text")
        .attr("x", MARGIN.left)
        .attr("y", 24)
        .attr("font-size", 13)
        .attr("font-weight", 600)
        .text("Hotel occupancy — Lahaina / K\u0101\u2018anapali / Kapalua (HTA)");


    // --- Scene 4 - The divergence (two panels, one time axis) ---
    // Diff units (% vs listing count) -> stacked panels
    let drawS4Annos;
    const s4 = chartSvg.append("g").style("display", "none");
    {
        // first month with a clean post-fire ltm window
        const START = "2024-08"
        const hSer = hotel.series.filter(d=>d.m >= START);
        const i0 = airbnb.months.indexOf(START);
        const aCounts = airbnb.bands["0-1km"].slice(i0);
        const aDates = airbnb.months.slice(i0).map(parseMid);

        const x4 = d3.scaleUtc()
                        .domain([parseMid(START), parseMid("2026-07")])
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
            .text("Hotel occupancy, West Maui — vs 2019 seasonal norm, dashed (HTA)");
        s4.append("g")
            .attr("transform", `translate(${MARGIN.left},0)`)
            .call(d3.axisLeft(yTop).ticks(4).tickFormat(d=> d+"%"));
        s4.append("g")
            .attr("transform", "translate(0,220)")
            .call(d3.axisBottom(x4));
        const hotelPath4 = s4.append("path")
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
            .text("Active Airbnb listings within 1 km of the burn zone (Inside Airbnb)");
        s4.append("g")
            .attr("transform", `translate(${MARGIN.left},0)`)
            .call(d3.axisLeft(yBot).ticks(4));
        s4.append("g")
            .attr("transform", `translate(0,460)`)
            .call(d3.axisBottom(x4));
        const airbnbPath4 = s4.append("path")
            .datum(aCounts)
            .attr("fill", "none")
            .attr("stroke", "#c0392b")
            .attr("stroke-width", 2.5)
            .attr("d", d3.line()
                .x((d, i) => x4(aDates[i]))
                .y(d => yBot(d))
            );
        const label123 = s4.append("text")
            .attr("x", x4(aDates[aDates.length - 1]) - 8)
            .attr("y", yBot(aCounts[aCounts.length - 1]) - 8)
            .attr("fill", "#c0392b")
            .attr("font-weight", 600)
            .text(aCounts[aCounts.length -1]);

        // Shared hover readout - one tooltip for both panels
        const aMonths = airbnb.months.slice(i0);
        const occByM = new Map(hSer.map(d=>[d.m, d.occ]));
        const cntByM = new Map(aMonths.map((m,j)=>[m, aCounts[j]]));
        const tipMonths = [...new Set([...hSer.map(d=>d.m), ...aMonths])].sort();
        const tipDates = tipMonths.map(parseMid);
        const fmtM4 = d3.utcFormat("%b %Y");
        const bisect4 = d3.bisector(d=>d).center;
        // Focus dot for the top panel (hotel occupancy)
        const focusDotTop = s4.append("circle")
                                .attr("r", 6)
                                .attr("fill", "#7f8c8d")
                                .attr("stroke", "#fff")
                                .attr("stroke-width", 1.5)
                                .style("display", "none");
        const focusDotBottom = s4.append("circle")
                                .attr("r", 6)
                                .attr("fill", "#c0392b")
                                .attr("stroke", "#fff")
                                .attr("stroke-width", 1.5)
                                .style("display", "none");
        s4.append("rect")
            .attr("x", MARGIN.left)
            .attr("y", 70)
            .attr("width", CHART_WIDTH-MARGIN.left - MARGIN.right)
            .attr("height", 390)
            .attr("fill", "transparent")
            .on("pointermove", (event)=>{
                const [mx] = d3.pointer(event);
                const i = bisect4(tipDates, x4.invert(mx));
                const m = tipMonths[i];
                let rows = "";
                if (occByM.has(m)) {
                    // Show the focus dot for top panel
                    focusDotTop.style("display", null)
                                .attr("cx", x4(tipDates[i]))
                                .attr("cy", yTop(occByM.get(m)));
                    // Update the tooltip row for the top panel
                    rows += `Hotel occupancy: ${occByM.get(m)}%<br>`;
                } else{
                    // Hide the focus dot for the top panel
                    focusDotTop.style("display","none");
                    // Update the tooltip row if no data for the top panel
                    rows += `Hotel occupancy: no data for this month.<br>`;
                }
                if (cntByM.has(m)) {
                    // Show the focus dot for bottom panel
                    focusDotBottom.style("display", null)
                                .attr("cx", x4(tipDates[i]))
                                .attr("cy", yBot(cntByM.get(m)));
                    // Update the tooltip row for the bottom panel
                    rows += `Airbnb listings within 1km: ${cntByM.get(m)}<br>`;
                } else {
                    // Hide the focus dot for the bottom panel
                    focusDotBottom.style("display","none");
                    // Update the tooltip if no data for the bottom panel
                    rows +=`Airbnb listings: no data for this month.<br>`;
                }
                d3.select("#tooltip")
                    .style("display", "block")
                    .style("left", (event.pageX+12)+"px")
                    .style("top", (event.pageY-10)+"px")
                    .html(`<b>${fmtM4(tipDates[i])}</b><br>` + rows);
            })
            .on("pointerout", ()=> {
                // Hide the focus dots
                focusDotTop.style("display", "none");
                focusDotBottom.style("display", "none");
                // Hide the tooltip
                d3.select("#tooltip").style("display", "none")
            });

        const s4annoG = s4.append("g");
        drawS4Annos = () => {
            // Hotel line animation: color handoff
            hotelPath4
                .attr("stroke", "#c0392b")
                .attr("stroke-width", 2.5)
                .transition()
                .delay(2400)
                .duration(3200)
                .ease(d3.easeCubicOut)
                .attr("stroke", "#7f8c8d")
                .attr("stroke-width", 2);
            s4annoG.selectAll("*").remove();

            // Airbnb line animation: animate the line drawing
            const totalLength = airbnbPath4.node().getTotalLength();
            airbnbPath4
                .attr("stroke-dasharray", `${totalLength} ${totalLength}`)
                .attr("stroke-dashoffset", totalLength)
                .transition()
                .delay(300)
                .duration(3600)
                .ease(d3.easeCubicInOut)
                .attr("stroke-dashoffset", 0)
                .on("end", ()=> airbnbPath4.attr("stroke-dasharray", null));
            label123.attr("opacity", 0)
                .transition()
                .delay(3200)
                .duration(300)
                .attr("opacity", 1);

            s4annoG.call(d3.annotation()
                .type(d3.annotationCalloutCircle)
                .annotations([
                    {
                        x: x4(parseMid("2024-08")),
                        y: yBot(5), dx: 40, dy: -40,
                        note: {
                            title: "5 listings",
                            label: "Active within 1 km of the burn zone in August 2024.",
                            wrap: 200 },
                        subject: { radius: 5 } },
                    {
                        x: x4(parseMid("2026-02")),
                        y: yTop(76.3), dx: -50, dy: 40,
                        note: { label: "Only the 2026 peak season came within 3 points of the 2019 norm.",
                        wrap: 200 },
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

    // Draw the coast and burn area layers
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

    // Color scale for distance bands
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

    // Add the burn area to the legend
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
                        .attr("r",2)
                        .attr("fill", p=> bandColor(p[2]))
                        .attr("fill-opacity", 0.6)
                        .on("pointerover", (ev, p)=> {
                            tip.style("display", "block")
                                .style("left", (ev.pageX+12) + "px")
                                .style("top", (ev.pageY-10) + "px")
                                .html(`<b>${mp.months[state.monthIdx]}</b><br>` +
                                    `Band: ${mp.bands[p[2]]}<br>` +
                                    `Active ${p[3].split("").filter(c=>c === "1").length} of 24 months`
                                );
                        })
                        .on("pointerout", ()=> {
                            tip.style("display", "none");
                        });

    // Update the map
    const CLEAN0 = mp.months.indexOf("2024-08");
    // Area labels (approx. coordinates)
    const PLACES = [
        { name: "Kapalua",      lon: -156.666, lat: 21.000 },
        { name: "Nāpili",       lon: -156.678, lat: 20.994 },
        { name: "Kāʻanapali",   lon: -156.695, lat: 20.923 },
        { name: "Lahaina town", lon: -156.679, lat: 20.878 },
        { name: "Olowalu",      lon: -156.620, lat: 20.811 },
    ];

    function updateMap() {
        d3.select("#month-label").text(mp.months[state.monthIdx]);
        d3.select("#ltm-warn").style("visibility", state.monthIdx < CLEAN0 ? "visible" : "hidden");
        dots.attr("display", p=> p[3][state.monthIdx] === "1" ? null : "none");
        }
        // Region-tier labels (cartographic convention: caps + letterspacing)
        const REGIONS = [
            { name: "WEST MAUI",          lon: -156.590, lat: 20.885 },
        ];
        mapG.append("g").selectAll("text")
            .data(PLACES)
            .join("text")
            .attr("x", d => proj([d.lon, d.lat])[0] + 8)
            .attr("y", d => proj([d.lon, d.lat])[1])
            .attr("font-size", 11)
            .attr("fill", "#333")
            .attr("text-anchor", "start")
            .text(d => d.name);
        mapG.append("g").selectAll("text")
            .data(REGIONS)
            .join("text")
            .attr("x", d => proj([d.lon, d.lat])[0])
            .attr("y", d => proj([d.lon, d.lat])[1])
            .attr("text-anchor", "middle")
            .attr("font-size", 30)
            .attr("letter-spacing", "0.25em")
            .attr("fill", "#bbb")
            .text(d => d.name);

        // wheel zoom + drag pan
        mapSvg.call(d3.zoom()
            .scaleExtent([1, 8])
            .on("zoom", (event) => {
                mapG.attr("transform", event.transform);
                mapSvg.style("cursor", event.transform.k > 1 ? "grab" : "zoom-in")
            })
        );

        // Map title that fixed to the SVG frame
        const mapTitle = mapSvg.append("text")
            .attr("x", 24)
            .attr("y", 40)
            .attr("font-size", 13)
            .attr("font-weight", 600);
        mapTitle.append("tspan")
            .text("Active Airbnb listings, West Maui")
        mapTitle.append("tspan")
            .attr("x", 24)
            .attr("y", 56)
            .text("\u2014 by distance to the burn zone (Inside Airbnb)");


    // --- Scene renderers ---
    const RENDERERS = {
        1: () => {frameChart("2023-01", "2023-07", []); drawAnnos(1); },
        2: () => {frameChart("2023-01", "2024-02",
               ["2023-08-08", "2023-10-08"]); drawAnnos(2); },
        3: () => { frameChart("2023-01", "2026-05",
               ["2024-05-13", "2024-06-10"]); drawAnnos(3);},
        4: () => {
            s4.attr("opacity", 0)
                .transition()
                .duration(1000)
                .ease(d3.easeCubicOut)
                .attr("opacity", 1);
            drawS4Annos();
        },
        5: updateMap,
    };

    // Hover readout for Scenes1-3
    const focusDot = plot.append("circle")
                        .attr("r", 6)
                        .attr("fill", "#c0392b")
                        .attr("stroke", "#fff")
                        .attr("stroke-width", 1.5)
                        .style("display", "none");
    const fmtM = d3.utcFormat("%b %Y");
    const bisectDate = d3.bisector(d=>d).center;

    plot.append("rect")
            .attr("x", MARGIN.left)
            .attr("y", MARGIN.top)
            .attr("width", CHART_WIDTH - MARGIN.left - MARGIN.right)
            .attr("height", CHART_HEIGHT - MARGIN.top - MARGIN.bottom)
            .attr("fill", "transparent")
            .on("pointermove", (ev) => {
                const [mx] = d3.pointer(ev);
                const i = bisectDate(hDates, x.invert(mx));
                const d = hotel.series[i];
                focusDot.style("display", null)
                    .attr("cx", x(hDates[i]))
                    .attr("cy",y(d.occ));
                // Update the tooltip with the current date and occupancy
                d3.select("#tooltip").style("display", "block")
                    .style("left", (ev.pageX + 12) +"px")
                    .style("top", (ev.pageY - 10) + "px")
                    .html(`<b>${fmtM(hDates[i])}</b><br>Occupancy: ${d.occ}%`);
            })
            .on("pointerout", () => {
                focusDot.style("display", "none");
                d3.select("#tooltip").style("display", "none");
            });
    eventG.raise();

    // Render function updates the scene label, text, and visibility of chart
    function render() {
        // Update the scene content: label, text, and navigation buttons
        d3.select("#scene-label").html(
            d3.range(1, NSCENES+1).map(i=>
                `<span style="color:${i === state.scene ? '#c0392b': '#ccc'}">\u25cf</span>`
            ).join(" ")
        );
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
        d3.select("#outro").style("display", state.scene === 5 ? null : "none");
        RENDERERS[state.scene]();
    }

    // --- Triggers ---
    d3.select("#month-slider").on("input", function() {
        state.monthIdx = +this.value;
        updateMap();
    })
    // Play: auto-advance the month slider when the play button is clicked
    let playTimer = null;
    function stopPlay() {
        if (playTimer) {
            playTimer.stop();
            playTimer = null;
        }
        d3.select("#play").html("&#9658; Play");
    }

    d3.select("#play").on("click", ()=> {
        // If the play timer is already running, stop it
        if (playTimer) {
            stopPlay();
            return;
        }
        // Reset the month index
        // At the last month, Play restarts from the beginning
        if (state.monthIdx >= mp.months.length -1) {
            state.monthIdx = -1;
        }
        // Start the play timer
        d3.select("#play").html("&#10074;&#10074; Pause");
        playTimer = d3.interval(()=> {
            state.monthIdx+=1;
            d3.select("#month-slider").property("value", state.monthIdx);
            updateMap();
            if(state.monthIdx >= mp.months.length-1) {
                stopPlay();
            }
        }, 500);

    });

    function goToScene(delta) {
        stopPlay();
        state.scene = Math.max(1, Math.min(NSCENES, state.scene + delta));
        render();
        d3.select("#scene-nav").node()
            .scrollIntoView({behavior: "smooth", block: "start"});
    }

    // Go to next or previous scene when the navigation buttons are clicked
    d3.select("#next").on("click", ()=> goToScene(1));
    d3.select("#prev").on("click", ()=> goToScene(-1));

    // Keyboard navigation: left and right arrow keys to navigate the scenes
    d3.select(window).on("keydown", (event)=> {
        // Ignore key events if it's coming from an input element
        // Let the focused slider keep its native arrow-key behavior
        if (event.target.tagName == "INPUT") return;
        // If right arrow key is pressed, go to the next scene
        if (event.key === "ArrowRight") goToScene(1);
        // if the left arrow key is pressed, go to the previous scene
        if (event.key === "ArrowLeft") goToScene(-1);
    });
    // --- Initial render ---
    render();
});
