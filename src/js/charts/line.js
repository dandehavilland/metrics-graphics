charts.line = function(args) {
    'use strict';
    this.args = args;

    this.init = function(args) {
        raw_data_transformation(args);
        process_line(args);
        init(args);
        x_axis(args);
        y_axis(args);
        return this;
    };

    this.mainPlot = function() {
        var svg = mg_get_svg_child_of(args.target),
            data_median = 0,
            confidence_area,
            chartContext = this,
            updateTransitionDuration = (args.transition_on_update) ? 1000 : 0,
            mapToY = function(d) { return d[args.y_accessor]; };

        //main area
        var area = d3.svg.area()
            .x(args.scalefns.xf)
            .y0(args.scales.Y.range()[0])
            .y1(args.scalefns.yf)
            .interpolate(args.interpolate);

        //if it already exists, remove it
        var existing_band = svg.select('.mg-confidence-band');
        if (!existing_band.empty()) {
            existing_band.remove();
        }

        if (args.show_confidence_band) {
            confidence_area = d3.svg.area()
                .x(args.scalefns.xf)
                .y0(function(d) {
                    var l = args.show_confidence_band[0];
                    return args.scales.Y(d[l]);
                })
                .y1(function(d) {
                    var u = args.show_confidence_band[1];
                    return args.scales.Y(d[u]);
                })
                .interpolate(args.interpolate);
        }

        //main line
        var line = d3.svg.line()
            .x(args.scalefns.xf)
            .y(args.scalefns.yf)
            .interpolate(args.interpolate);

        //for animating line on first load
        var flat_line = d3.svg.line()
            .x(args.scalefns.xf)
            .y(function() { return args.scales.Y(data_median); })
            .interpolate(args.interpolate);


        //for building the optional legend
        var legend = '';
        var isBounded = !!(args.min_x || args.max_x || args.min_y || args.max_y);

        for (var i = args.data.length - 1; i >= 0; i--) {
            var boundedData = args.data[i];

            // !isBounded ? args.data[i] : args.data[i].filter(function(d) {
            //     var xVal = d[args.x_accessor],
            //         yVal = d[args.y_accessor];
            //
            //     return (args.min_x && xVal > args.min_x)
            //         && (args.max_x && xVal < args.max_x)
            //         && (args.min_y && yVal > args.min_y)
            //         && (args.max_y && yVal < args.max_y);
            // });
            //
            // console.log(isBounded, boundedData.length, args.min_x, args.max_x, args.min_y, args.max_y);

            //override increment if we have a custom increment series
            var line_id = i + 1;
            if (args.custom_line_color_map.length > 0) {
                line_id = args.custom_line_color_map[i];
            }

            args.data[i].line_id = line_id;

            //add confidence band
            if (args.show_confidence_band) {
                svg.append('path')
                    .attr('class', 'mg-confidence-band')
                    .attr('d', confidence_area(args.data[i]))
                    .attr('clip-path', 'url(#mg-plot-window-' + mg_strip_punctuation(args.target) + ')');
            }

            //add the area
            var $area = $(args.target).find('svg path.mg-area' + (line_id) + '-color');
            if (args.area && !args.use_data_y_min && !args.y_axis_negative && args.data.length <= 1) {
                //if area already exists, transition it
                if ($area.length > 0) {
                    $(svg.node()).find('.mg-y-axis').after($area.detach());
                    d3.select($area.get(0))
                        .transition()
                            .duration(updateTransitionDuration)
                            .attr('d', area(boundedData))
                            .attr('clip-path', 'url(#mg-plot-window-'+ mg_strip_punctuation(args.target)+')');
                } else { //otherwise, add the area
                    svg.append('path')
                        .attr('class', 'mg-main-area ' + 'mg-area' + (line_id) + '-color')
                        .attr('d', area(boundedData))
                        .attr('clip-path', 'url(#mg-plot-window-' + mg_strip_punctuation(args.target) + ')');
                }
            } else if ($area.length > 0) {
                $area.remove();
            }

            //add the line, if it already exists, transition the fine gentleman
            var $existing_line = $(args.target).find('svg path.mg-main-line.mg-line' + (line_id) + '-color').first();
            if ($existing_line.length > 0) {
                var rolloverCircles = svg.selectAll('circle.mg-line-rollover-circle');
                rolloverCircles.remove();

                chartContext.preventRollover = true;

                $(svg.node()).find('.mg-y-axis').after($existing_line.detach());
                d3.select($existing_line.get(0))
                    .transition()
                        .duration(updateTransitionDuration)
                        .attr('d', line(boundedData))
                        .each('end', function() {
                            chartContext.preventRollover = false;
                        });
            }
            else { //otherwise...
                //if we're animating on load, animate the line from its median value
                if (args.animate_on_load) {
                    data_median = d3.median(boundedData, mapToY);

                    svg.append('path')
                        .attr('class', 'mg-main-line ' + 'mg-line' + (line_id) + '-color')
                        .attr('d', flat_line(boundedData))
                        .transition()
                            .duration(1000)
                            .attr('d', line(boundedData))
                            .attr('clip-path', 'url(#mg-plot-window-' + mg_strip_punctuation(args.target) + ')');
                } else { //or just add the line
                    svg.append('path')
                        .attr('class', 'mg-main-line ' + 'mg-line' + (line_id) + '-color')
                        .attr('d', line(boundedData))
                        .attr('clip-path', 'url(#mg-plot-window-' + mg_strip_punctuation(args.target) + ')');
                }
            }

            //build legend
            if (args.legend) {
                legend = "<span class='mg-line" + line_id  + "-legend-color'>&mdash; "
                        + args.legend[i] + "&nbsp; </span>" + legend;
            }
        }

        if (args.legend) {
            $(args.legend_target).html(legend);
        }

        return this;
    };

    this.markers = function() {
        markers(args);
        return this;
    };

    this.rollover = function() {
        var svg = mg_get_svg_child_of(args.target),
            g,
            dataPointContainer;

        //remove the old rollovers if they already exist
        svg.select('.mg-rollover-rect').remove();
        svg.select('.mg-voronoi').remove();

        //remove the old rollover circle if they already exist
        svg.select('.mg-line-rollover-circle').remove();

        //rollover text
        dataPointContainer = svg.select('.mg-active-datapoint-container');

        if (dataPointContainer.empty()){
            svg.append('g')
                .attr('class', 'mg-active-datapoint-container')
                .attr('transform', 'translate(' + (args.width - args.right) + ',' + (args.top / 2) + ')')
                .append('text')
                    .attr('class', 'mg-active-datapoint')
                    .classed('mg-active-datapoint-small', args.use_small_class)
                    .attr('xml:space', 'preserve')
                    .attr('text-anchor', 'end');
        }

        //append circle
        svg.selectAll('.mg-line-rollover-circle')
            .data(args.data).enter()
                .append('circle')
                .attr({
                  'class': function(d, i) {
                      return [
                          'mg-line-rollover-circle',
                          'mg-line' + d.line_id + '-color',
                          'mg-area' + d.line_id + '-color'
                      ].join(' ');
                  },
                  'cx': 0,
                  'cy': 0,
                  'r': 0
                });

        //update our data by setting a unique line id for each series
        //increment from 1... unless we have a custom increment series
        var line_id = 1;

        for (var i = 0; i < args.data.length; i++) {
            for (var j = 0; j < args.data[i].length; j++) {
                //if custom line-color map is set, use that instead of line_id
                if (args.custom_line_color_map.length > 0) {
                    args.data[i][j].line_id = args.custom_line_color_map[i];
                } else {
                    args.data[i][j].line_id = line_id;
                }
            }
            line_id++;
        }

        var data_nested;
        var xf;

        //for multi-line, use voronoi
        if (args.data.length > 1 && !args.aggregate_rollover) {
            //main rollover
            var voronoi = d3.geom.voronoi()
                .x(function(d) { return args.scales.X(d[args.x_accessor]).toFixed(2); })
                .y(function(d) { return args.scales.Y(d[args.y_accessor]).toFixed(2); })
                .clipExtent([[args.buffer, args.buffer], [args.width - args.buffer, args.height - args.buffer]]);

            g = svg.append('g')
                .attr('class', 'mg-voronoi');

            //we'll be using these when constructing the voronoi rollovers
            data_nested = d3.nest()
                .key(function(d) {
                    return args.scales.X(d[args.x_accessor]) + ","
                        + args.scales.Y(d[args.y_accessor]);
                })
                .rollup(function(v) { return v[0]; })
                .entries(d3.merge(args.data.map(function(d) { return d; })))
                .map(function(d) { return d.values; })
                .filter(function(d) { return d; });

            var voronoiData = voronoi(data_nested)
                // quickfix: filter out any empty points (happens where lines overlap)
                // TODO: find the root of this
                .filter(function(d) { return d && d.length > 0; });

            g.selectAll('path')
                .data(voronoiData)
                .enter()
                    .append('path')
                        .filter(function(d) { return d !== undefined; })
                        .attr("d", function(d) { return "M" + d.join("L") + "Z"; })
                        .datum(function(d) { return d.point; }) //because of d3.nest, reassign d
                        .attr('class', function(d) {
                            if (args.linked) {
                                var v = d[args.x_accessor];
                                var formatter = d3.time.format(args.linked_format);

                                //only format when x-axis is date
                                var id = (typeof v === 'number')
                                        ? i
                                        : formatter(v);

                                return 'mg-line' + d.line_id + '-color ' + 'roll_' + id;
                            } else {
                                return 'mg-line' + d.line_id + '-color';
                            }
                        })
                        .on('mouseover', this.rolloverOn(args))
                        .on('mouseout', this.rolloverOff(args))
                        .on('mousemove', this.rolloverMove(args))
                        .on('mousedown', this.mouseDown(args))
                        .on('mouseup', this.mouseUp(args));
        }

        // for multi-lines and aggregated rollovers, use rects
        else if (args.data.length > 1 && args.aggregate_rollover) {
            data_nested = d3.nest()
                .key(function(d) { return d[args.x_accessor]; })
                .entries(d3.merge(args.data));

            xf = data_nested.map(function(di) {
                return args.scales.X(new Date(di.key));
            });

            g = svg.append('g')
              .attr('class', 'mg-rollover-rect');

            g.selectAll('.mg-rollover-rects')
                .data(data_nested).enter()
                    .append('rect')
                        .attr('x', function(d, i) {
                            //if data set is of length 1
                            if(xf.length === 1) {
                                return args.left + args.buffer;
                            } else if (i === 0) {
                                return xf[i].toFixed(2);
                            } else {
                                return ((xf[i-1] + xf[i])/2).toFixed(2);
                            }
                        })
                        .attr('y', args.top)
                        .attr('width', function(d, i) {
                            //if data set is of length 1
                            if(xf.length === 1) {
                                return args.width - args.right - args.buffer;
                            } else if (i === 0) {
                                return ((xf[i+1] - xf[i]) / 2).toFixed(2);
                            } else if (i == xf.length - 1) {
                                return ((xf[i] - xf[i-1]) / 2).toFixed(2);
                            } else {
                                return ((xf[i+1] - xf[i-1]) / 2).toFixed(2);
                            }
                        })
                        .attr('height', args.height - args.bottom - args.top - args.buffer)
                        .attr('opacity', 0)
                        .on('mouseover', this.rolloverOn(args))
                        .on('mouseout', this.rolloverOff(args))
                        .on('mousemove', this.rolloverMove(args))
                        .on('mousedown', this.mouseDown(args))
                        .on('mouseup', this.mouseUp(args));
        }

        //for single line, use rects
        else {
            //set to 1 unless we have a custom increment series
            line_id = 1;
            if (args.custom_line_color_map.length > 0) {
                line_id = args.custom_line_color_map[0];
            }

            g = svg.append('g')
                .attr('class', 'mg-rollover-rect');

            xf = args.data[0].map(args.scalefns.xf);

            g.selectAll('.mg-rollover-rects')
                .data(args.data[0]).enter()
                    .append('rect')
                        .attr('class', function(d, i) {
                            if (args.linked) {
                                var v = d[args.x_accessor];
                                var formatter = d3.time.format(args.linked_format);

                                //only format when x-axis is date
                                var id = (typeof v === 'number')
                                        ? i
                                        : formatter(v);

                                return 'mg-line' + line_id + '-color ' + 'roll_' + id;
                            } else {
                                return 'mg-line' + line_id + '-color';
                            }
                        })
                        .attr('x', function(d, i) {
                            //if data set is of length 1
                            if (xf.length === 1) {
                                return args.left + args.buffer;
                            } else if (i === 0) {
                                return xf[i].toFixed(2);
                            } else {
                                return ((xf[i-1] + xf[i])/2).toFixed(2);
                            }
                        })
                        .attr('y', function(d, i) {
                            return (args.data.length > 1)
                                ? args.scalefns.yf(d) - 6 //multi-line chart sensitivity
                                : args.top;
                        })
                        .attr('width', function(d, i) {
                            //if data set is of length 1
                            if (xf.length === 1) {
                                return args.width - args.right - args.buffer;
                            } else if (i === 0) {
                                return ((xf[i+1] - xf[i]) / 2).toFixed(2);
                            } else if (i === xf.length - 1) {
                                return ((xf[i] - xf[i-1]) / 2).toFixed(2);
                            } else {
                                return ((xf[i+1] - xf[i-1]) / 2).toFixed(2);
                            }
                        })
                        .attr('height', function(d, i) {
                            return (args.data.length > 1)
                                ? 12 //multi-line chart sensitivity
                                : args.height - args.bottom - args.top - args.buffer;
                        })
                        .attr('opacity', 0)
                        .on('mouseover', this.rolloverOn(args))
                        .on('mouseout', this.rolloverOff(args))
                        .on('mousemove', this.rolloverMove(args))
                        .on('mousedown', this.mouseDown(args))
                        .on('mouseup', this.mouseUp(args));
        }

        //if the dataset is of length 1, trigger the rollover for our solitary rollover rect
        if (args.data.length == 1 && args.data[0].length == 1) {
            d3.select('.mg-rollover-rect .mg-line1-color')
                .on('mouseover')(args.data[0][0], 0);
        }

        if (args.brushing && (args.brushed_min_x || args.brushed_max_x || args.brushed_min_y || args.brushed_max_y)) {
            svg.classed('mg-brushed', true);
        }

        return this;
    };

    this.rolloverOn = function(args) {
        var svg = mg_get_svg_child_of(args.target);
        var fmt;
        var chartContext = this;

        switch(args.processed.x_time_frame) {
            case 'seconds':
                fmt = d3.time.format('%b %e, %Y  %H:%M:%S');
                break;
            case 'less-than-a-day':
                fmt = d3.time.format('%b %e, %Y  %I:%M%p');
                break;
            case 'four-days':
                fmt = d3.time.format('%b %e, %Y  %I:%M%p');
                break;
            default:
                fmt = d3.time.format('%b %e, %Y');
        }

        return function(d, i) {
            if (chartContext.preventRollover) {
                return;
            }

            if (args.aggregate_rollover && args.data.length > 1) {

                // hide the circles in case a non-contiguous series is present
                svg.selectAll('circle.mg-line-rollover-circle')
                    .style('opacity', 0);

                d.values.forEach(function(datum) {

                  if (is_within_bounds(datum, args)){
                    var circle = svg.select('circle.mg-line' + datum.line_id + '-color')
                        .attr({
                            'cx': function() {
                                return args.scales.X(datum[args.x_accessor]).toFixed(2);
                            },
                            'cy': function() {
                                return args.scales.Y(datum[args.y_accessor]).toFixed(2);
                            },
                            'r': args.point_size
                        })
                        .style('opacity', 1);
                  }
                });
            } else {

                //show circle on mouse-overed rect
                if (is_within_bounds(d, args)){
                    svg.selectAll('circle.mg-line-rollover-circle')
                        .classed('mg-area' + d.line_id + '-color', true)
                        .attr('cx', function() {
                            return args.scales.X(d[args.x_accessor]).toFixed(2);
                        })
                        .attr('cy', function() {
                            return args.scales.Y(d[args.y_accessor]).toFixed(2);
                        })
                        .attr('r', args.point_size)
                        .style('opacity', 1);
                }

                //trigger mouseover on all rects for this date in .linked charts
                if (args.linked && !MG.globals.link) {
                    MG.globals.link = true;

                    var v = d[args.x_accessor];
                    var formatter = d3.time.format(args.linked_format);

                    //only format when y-axis is date
                    var id = (typeof v === 'number')
                            ? i
                            : formatter(v);

                    //trigger mouseover on matching line in .linked charts
                    d3.selectAll('.mg-line' + d.line_id + '-color.roll_' + id)
                        .each(function(d, i) {
                            d3.select(this).on('mouseover')(d,i);
                        });
                }
            }

            svg.selectAll('text')
                .filter(function(g, j) {
                    return d === g;
                })
                .attr('opacity', 0.3);

            var num = rolloverNumberFormatter(args);

            //update rollover text
            if (args.show_rollover_text) {
                var textContainer = svg.select('.mg-active-datapoint'),
                    lineCount = 0,
                    lineHeight = 1.1;

                textContainer.select('*').remove();

                if (args.aggregate_rollover && args.data.length > 1) {
                    if (args.time_series) {
                        var date = new Date(d.key);

                        textContainer.append('tspan')
                            .text((fmt(date) + '  ' + args.yax_units).trim());

                        lineCount = 1;

                        d.values.forEach(function(datum) {
                            var label = textContainer.append('tspan')
                                .attr({
                                  x: 0,
                                  y: (lineCount * lineHeight) + 'em'
                                })
                                .text(num(datum[args.y_accessor]));

                            textContainer.append('tspan')
                                .attr({
                                  x: -label.node().getComputedTextLength(),
                                  y: (lineCount * lineHeight) + 'em'
                                })
                                .text('\u2014 ') // mdash
                                .classed('mg-hover-line' + datum.line_id + '-color', true)
                                .style('font-weight', 'bold');

                            lineCount++;
                        });

                        textContainer.append('tspan')
                            .attr('x', 0)
                            .attr('y', (lineCount * lineHeight) + 'em')
                            .text('\u00A0');
                    } else {
                        d.values.forEach(function(datum) {
                            var label = textContainer.append('tspan')
                                .attr({
                                  x: 0,
                                  y: (lineCount * lineHeight) + 'em'
                                })
                                .text(args.x_accessor + ': ' + datum[args.x_accessor]
                                    + ', ' + args.y_accessor + ': ' + args.yax_units
                                    + num(datum[args.y_accessor]));

                            textContainer.append('tspan')
                                .attr({
                                  x: -label.node().getComputedTextLength(),
                                  y: (lineCount * lineHeight) + 'em'
                                })
                                .text('\u2014 ') // mdash
                                .classed('mg-hover-line' + datum.line_id + '-color', true)
                                .style('font-weight', 'bold');

                            lineCount++;
                        });
                    }

                    // append an blank (&nbsp;) line to mdash positioning
                    textContainer.append('tspan')
                        .attr('x', 0)
                        .attr('y', (lineCount * lineHeight) + 'em')
                        .text('\u00A0');
                } else {
                    if (args.time_series) {
                        var dd = new Date(+d[args.x_accessor]);
                        dd.setDate(dd.getDate());

                        textContainer.append('tspan')
                            .text(fmt(dd) + '  ' + args.yax_units
                                + num(d[args.y_accessor]));
                    }
                    else {
                        textContainer.append('tspan')
                            .text(args.x_accessor + ': ' + d[args.x_accessor]
                                + ', ' + args.y_accessor + ': ' + args.yax_units
                                + num(d[args.y_accessor]));
                    }
                }
            }

            if (args.mouseover) {
                args.mouseover(d, i);
            }
        };
    };

    this.rolloverOff = function(args) {
        var svg = mg_get_svg_child_of(args.target);

        return function(d, i) {
            if (args.linked && MG.globals.link) {
                MG.globals.link = false;

                var v = d[args.x_accessor];
                var formatter = d3.time.format(args.linked_format);

                //only format when y-axis is date
                var id = (typeof v === 'number')
                        ? i
                        : formatter(v);

                d3.selectAll('.roll_' + id)
                    .each(function(d, i) {
                        d3.select(this).on('mouseout')(d);
                    });
            }

            //remove active datapoint text on mouse out, except if we have a single
            svg.selectAll('circle.mg-line-rollover-circle')
                .style('opacity', function() {
                        if (args.data.length == 1 && args.data[0].length == 1) {
                            return 1;
                        }
                        else {
                            return 0;
                        }
                    });

            svg.select('.mg-active-datapoint')
                .text('');

            if (args.mouseout) {
                args.mouseout(d, i);
            }
        };
    };

    this.rolloverMove = function(args) {
        return function(d, i) {
            if (args.mousemove) {
                args.mousemove(d, i);
            }
        };
    };

    this.mouseDown = function(args) {
        var chartContext = this;

        return function(d, i) {
            if (args.mousedown) {
                args.mousedown(d, i, chartContext);
            }
        };
    };

    this.mouseUp = function(args) {
        var chartContext = this;

        return function(d, i) {
            if (args.mouseup) {
                args.mouseup(d, i, chartContext);
            }
        };
    };

    this.windowListeners = function() {
        mg_window_listeners(this.args);
        return this;
    };

    this.brushing = function() {
        var args = this.args,
            chartContext = this;

        if (args.brushing === false) {
            return this;
        }

        var isDragging = false,
            mouseDown = false,
            originX,
            svg = d3.select(args.target).select('svg'),
            rollover = svg.select('.mg-rollover-rect, .mg-voronoi'),
            brushingGroup,
            extentRect;

        rollover.classed('mg-brush-container', true);

        brushingGroup = rollover.insert('g', '*')
            .classed('mg-brush', true);

        extentRect = brushingGroup.append('rect')
            .attr({
                opacity: 0,
                y: args.top,
                height: args.height - args.bottom - args.top - args.buffer
            })
            .classed('mg-extent', true);

        // mousedown, start area selection
        svg.on('mousedown', function() {
            mouseDown = true;
            isDragging = false;
            originX = d3.mouse(this)[0];
            svg.classed('mg-brushed', false);
            extentRect.attr({
                x: d3.mouse(this)[0],
                opacity: 0,
                width: 0
            });
        });

        // mousemove / drag, expand area selection
        svg.on('mousemove', function() {
            if (mouseDown) {
                isDragging = true;
                rollover.classed('mg-brushing', true);

                var mouseX = d3.mouse(this)[0],
                    newX = Math.min(originX, mouseX),
                    width = Math.max(originX, mouseX) - newX;

                extentRect.attr({
                    x: newX,
                    width: width,
                    opacity: 1
                });
            }
        });

        // mouseup, finish area selection
        svg.on('mouseup', function() {
            mouseDown = false;

            var xScale = args.scales.X,
                yScale = args.scales.Y,
                flatData = [].concat.apply([], args.data),
                boundedData,
                yBounds,
                xBounds,
                extentX0 = +extentRect.attr('x'),
                extentX1 = extentX0 + (+extentRect.attr('width')),
                interval = get_brush_interval(args),
                offset = 0,
                mapDtoX = function(d) { return d[args.x_accessor]; },
                mapDtoY = function(d) { return d[args.y_accessor]; };

            // if we're zooming in: calculate the domain for x and y axes based on the selected rect
            if (isDragging) {
                isDragging = false;

                if (args.brushed) {
                    args.brushHistory = args.brushHistory || [];
                    args.brushHistory.push({
                        max_x: args.brushed_max_x,
                        min_x: args.brushed_min_x,
                        max_y: args.brushed_max_y,
                        min_y: args.brushed_min_y
                    });
                }

                args.brushed = true;

                boundedData = [];
                // is there at least one data point in the chosen selection? if not, increase the range until there is.
                var iterations = 0;
                while (boundedData.length === 0 && iterations <= flatData.length) {
                    args.brushed_min_x = interval.round(xScale.invert(extentX0));
                    args.brushed_max_x = Math.max(
                        interval.offset(args.min_x, 1),
                        interval.round(xScale.invert(extentX1)));

                    boundedData = flatData.filter(function(d) {
                        var val = d[args.x_accessor];
                        return val >= args.brushed_min_x && val <= args.brushed_max_x;
                    });

                    iterations++;
                }

                xBounds = d3.extent(boundedData, mapDtoX);
                args.brushed_min_x = +xBounds[0];
                args.brushed_max_x = +xBounds[1];
                xScale.domain(xBounds);

                yBounds = d3.extent(boundedData, mapDtoY);
                // add 10% padding on the y axis for better display
                // @TODO: make this an option
                args.brushed_min_y = yBounds[0] * 0.9;
                args.brushed_max_y = yBounds[1] * 1.1;
                yScale.domain(yBounds);
            }
            // if we're using out: use all of the data
            else {
                var previousBrush = args.brushHistory && args.brushHistory.pop();
                if (previousBrush) {
                    args.brushed_max_x = previousBrush.max_x;
                    args.brushed_min_x = previousBrush.min_x;
                    args.brushed_max_y = previousBrush.max_y;
                    args.brushed_min_y = previousBrush.min_y;

                    xBounds = [args.brushed_min_x, args.brushed_max_x];
                    yBounds = [args.brushed_min_y, args.brushed_max_y];
                    xScale.domain(xBounds);
                    yScale.domain(yBounds);
                } else {
                    rollover.classed('mg-brushing', false);
                    args.brushed = false;

                    delete args.brushed_max_x;
                    delete args.brushed_min_x;
                    delete args.brushed_max_y;
                    delete args.brushed_min_y;

                    boundedData = flatData;
                    xBounds = d3.extent(boundedData, mapDtoX);
                    yBounds = d3.extent(boundedData, mapDtoY);
                }
            }

            if (xBounds[0] < xBounds[1] && yBounds[0] < yBounds[1]) {
                // trigger the brushing callback
                if (args.brushing_callback) {
                    args.brushing_callback.apply(this, [{
                        min_x: xBounds[0],
                        max_x: xBounds[1],
                        min_y: yBounds[0],
                        max_y: yBounds[1]
                    }]);
                }
            }

            // redraw the chart
            MG.data_graphic(args);
        });

        return this;
    };

    this.init(args);

    return this;
};

function get_brush_interval(args) {
    var resolution = args.brushing_interval,
        interval;

    if (!resolution) {
        if (args.time_series) {
            resolution = d3.time.day;
        } else {
            resolution = 1;
        }
    }

    // work with N as integer
    if (typeof resolution === 'number') {
        interval = {
            round: function(val) {
                return resolution * Math.round(val / resolution);
            },
            offset: function(val, count) {
                return val + (resolution * count);
            }
        };
    }
    // work with d3.time.[interval]
    else if (typeof resolution.round === 'function'
             && typeof resolution.offset === 'function' ) {
        interval = resolution;
    }
    else {
        console.warn('The `brushing_interval` provided is invalid. It must be either a number or expose both `round` and `offset` methods');
    }

    return interval;
}

function is_within_bounds(datum, args) {
    var x = +datum[args.x_accessor],
        y = +datum[args.y_accessor];

    return x >= (+args.processed.min_x || x)
        && x <= (+args.processed.max_x || x)
        && y >= (+args.processed.min_y || y)
        && y <= (+args.processed.max_y || y);
}
