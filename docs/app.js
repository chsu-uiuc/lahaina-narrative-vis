
// Draft chart: monthly active listings, Lahaina district vs controls.
const svg = d3.select("#chart");
const WIDTH = +svg.attr("width"), HEIGHT = +svg.attr("height");
const MARGIN = { top: 30, right: 150, bottom: 40, left: 60 };   // right: legend space

d3.json("data/airbnb.json").then(data => {
    // 2024-08: Date object (UTC to avoid timezone off-by-one)
    const parse = d3.utcParse("%Y-%m");
    const dates = data.months.map(parse);

    const x = d3.scaleUtc()
                .domain(d3.extent(dates))
                .range([ MARGIN.left, WIDTH - MARGIN.right]);

    const y = d3.scaleLinear()
                .domain([0, d3.max(data.lahaina_total)]).nice()
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
        .datum(data.lahaina_total)
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
    svg.append("path").datum(data.lahaina_total)
        .attr("fill", "none").attr("stroke", "#c0392b")
        .attr("stroke-width", 2.5).attr("d", line);
    svg.append("text")
        .attr("x", WIDTH - MARGIN.right + 6)
        .attr("y", y(data.lahaina_total[data.lahaina_total.length - 1]))
        .attr("fill", "#c0392b").attr("font-size", 12).attr("font-weight", 600)
        .text("West Maui (Lahaina)");
});