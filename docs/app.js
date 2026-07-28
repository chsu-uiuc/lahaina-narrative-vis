
// Draft chart: monthly active listings, Lahaina district vs controls.
const svg = d3.select("#chart");
const WIDTH = +svg.attr("width"), HEIGHT = +svg.attr("height");
const MARGIN = { top: 30, right: 150, bottom: 40, left: 60 };

// Map
const mapSvg = d3.select("#map");
const MAP_WIDTH = +mapSvg.attr("width");
const MAP_HEIGHT = +mapSvg.attr("height");


Promise.all([
    d3.json("data/westmaui.geojson"),
    d3.json("data/burn.geojson"),
    d3.json("data/map_points.json"),
]).then(([coast, burn, mp]) => {
    // Fit the projection to the West maui outline, with 20px padding
    const proj = d3.geoMercator()
        .fitExtent([[20, 20], [MAP_WIDTH - 20, MAP_HEIGHT - 20]], coast);

    const path = d3.geoPath(proj);

    // Draw the West Maui outline
    mapSvg.append("path")
        .datum(coast)
        .attr("fill", "#f2f0eb")
        .attr("stroke", "#999")
        .attr("d", path);

    // Burn area overlay
    mapSvg.append("path")
        .datum(burn)
        .attr("fill", "#c0392b")
        .attr("fill-opacity", 0.25)
        .attr("stroke", "#c0392b")
        .attr("d", path);

    // Map points overlay
    const bandColor = d3.scaleOrdinal()
                        .domain(d3.range(mp.bands.length))
                        .range([
                            "#7b241c", "#c0392b", "#e67e22",
                            "#b7950b", "#7f8c8d", "#bdc3c7"
                        ]);

    // latest month
    const last = mp.months.length - 1 ;
    mapSvg.selectAll("circle")
            .data(mp.pts.filter(p=>p[3][last] === "1"))
            .join("circle")
            .attr("cx", p=> proj([p[0], p[1]])[0])
            .attr("cy", p=> proj([p[0], p[1]])[1])
            .attr("r", 2)
            .attr("fill", p=> bandColor(p[2]))
            .attr("fill-opacity", 0.6);
});


d3.json("data/airbnb.json").then(data => {
    // West Maui total = the six distance bands summed month by month
    const westMauiTotal = data.months.map((_, i) => d3.sum(Object.values(data.bands), s=>s[i]));
    // 2024-08: Date object (UTC to avoid timezone off-by-one)
    const parse = d3.utcParse("%Y-%m");
    const dates = data.months.map(parse);

    const x = d3.scaleUtc()
                .domain(d3.extent(dates))
                .range([ MARGIN.left, WIDTH - MARGIN.right]);

    const y = d3.scaleLinear()
                .domain([0, d3.max(westMauiTotal)]).nice()
                .range([HEIGHT - MARGIN.bottom,MARGIN.top]);

    svg.append("g")
        .attr("transform", `translate(0,${HEIGHT-MARGIN.bottom})`)
        .call(d3.axisBottom(x));
    svg.append("g")
        .attr("transform", `translate(${MARGIN.left},0)`)
        .call(d3.axisLeft(y));

    // line generator: pairs (date[i], value[i])
    const line = d3.line()
        .x((d, i) => x(dates[i]))
        .y(d => y(d));

    svg.append("path")
        .datum(westMauiTotal)
        .attr("fill", "none")
        .attr("stroke", "#c0392b")
        .attr("stroke-width", 2.5)
        .attr("d", line);

    // Control groups: South Maui + the three unaffected islands
    // Muted grays keep visual focus on the West Maui line (red)
    const controls = Object.entries(data.control);
    const color= d3.scaleOrdinal()
                    .domain(controls.map(([n])=>n))
                    .range(["#7f8c8d","#95a5a6","#b2bec3","#636e72"]);

    //Rescale y to cover the largetst control (O'ahu ~6.9k), then redraw
    y.domain([0, d3.max(controls, ([, s]) => d3.max(s))]).nice();
    // Redraw first
    svg.selectAll("g").remove();
    svg.selectAll("path").remove();

    // 
    svg.append("g").attr("transform", `translate(0,${HEIGHT - MARGIN.bottom})`).call(d3.axisBottom(x));
    svg.append("g").attr("transform", `translate(${MARGIN.left},0)`).call(d3.axisLeft(y));
    // Draw the controls
    for (const [name, series] of controls) {
        svg.append("path").datum(series)
            .attr("fill","none").attr("stroke", color(name))
            .attr("stroke-width",1.5).attr("d", line);
        // Direct labels at line ends instead of a legend box
        svg.append("text")
            .attr("x", WIDTH - MARGIN.right + 6)
            .attr("y", y(series[series.length - 1]))
            .attr("fill", color(name)).attr("font-size", 14)
            .text(name);
    }
    svg.append("path").datum(westMauiTotal)
        .attr("fill", "none").attr("stroke", "#c0392b")
        .attr("stroke-width", 2.5).attr("d", line);
    svg.append("text")
        .attr("x", WIDTH - MARGIN.right + 6)
        .attr("y", y(westMauiTotal[westMauiTotal.length - 1]))
        .attr("fill", "#c0392b").attr("font-size", 12).attr("font-weight", 600)
        .text("West Maui (Lahaina)");
});

// --- West maui hotel occupancy -----------------------------
const hotelSvg = d3.select("#hotel");
const HOTEL_WIDTH = +hotelSvg.attr("width")
const HOTEL_HEIGHT = +hotelSvg.attr("height");
const HOTEL_MARGIN = {top: 30, right: 30, bottom: 40, left: 60};

d3.json("data/hotel.json").then(h=>  {
    const parseM = d3.utcParse("%Y-%m");
    const dates = h.series.map(d=>parseM(d.m));

    const x = d3.scaleUtc()
                .domain(d3.extent(dates))
                .range([ HOTEL_MARGIN.left, HOTEL_WIDTH - HOTEL_MARGIN.right]);
    // occupancy is a percentage so fix the domain at 0-100 so the crash
    // reads at true scale
    const y = d3.scaleLinear()
                .domain([0, 100])
                .range([ HOTEL_HEIGHT - HOTEL_MARGIN.bottom, HOTEL_MARGIN.top]);

    hotelSvg.append("g")
        .attr("transform", `translate(0,${HOTEL_HEIGHT - HOTEL_MARGIN.bottom})`)
        .call(d3.axisBottom(x));
    hotelSvg.append("g")
        .attr("transform", `translate(${HOTEL_MARGIN.left},0)`)
        .call(d3.axisLeft(y).tickFormat(d=>d+"%"));

    hotelSvg.append("path")
        .datum(h.series)
        .attr("fill", "none")
        .attr("stroke", "#c0392b")
        .attr("stroke-width", 2.5)
        .attr("d", d3.line()
            .x((d, i) => x(dates[i]))
            .y(d=>y(d.occ)));

    // Vertical event lines from the data layer
    const parseD = d3.utcParse("%Y-%m-%d");
    for (const event of h.events) {
        const eventDate = x(parseD(event.date));
        hotelSvg.append("line")
            .attr("x1", eventDate)
            .attr("x2", eventDate)
            .attr("y1", HOTEL_MARGIN.top)
            .attr("y2", HOTEL_HEIGHT - HOTEL_MARGIN.bottom)
            .attr("stroke", "#555")
            .attr("stroke-dasharray", "4 3");

        hotelSvg.append("text")
            .attr("x", eventDate + 4)
            .attr("y", HOTEL_MARGIN.top + 12)
            .attr("fill", "#555")
            .attr("font-size", 11)
            .text(event.label);
    }
});