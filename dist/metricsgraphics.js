define("../../node_modules/almond/almond", ["exports"], function(__exports__) {
    "use strict";

    function __es6_export__(name, value) {
        __exports__[name] = value;
    }

    /**
     * @license almond 0.3.0 Copyright (c) 2011-2014, The Dojo Foundation All Rights Reserved.
     * Available via the MIT or new BSD license.
     * see: http://github.com/jrburke/almond for details
     */
    //Going sloppy to avoid 'use strict' string cost, but strict practices should
    //be followed.
    /*jslint sloppy: true */
    /*global setTimeout: false */

    var requirejs, require, define;
    (function (undef) {
        var main, req, makeMap, handlers,
            defined = {},
            waiting = {},
            config = {},
            defining = {},
            hasOwn = Object.prototype.hasOwnProperty,
            aps = [].slice,
            jsSuffixRegExp = /\.js$/;

        function hasProp(obj, prop) {
            return hasOwn.call(obj, prop);
        }

        /**
         * Given a relative module name, like ./something, normalize it to
         * a real name that can be mapped to a path.
         * @param {String} name the relative name
         * @param {String} baseName a real name that the name arg is relative
         * to.
         * @returns {String} normalized name
         */
        function normalize(name, baseName) {
            var nameParts, nameSegment, mapValue, foundMap, lastIndex,
                foundI, foundStarMap, starI, i, j, part,
                baseParts = baseName && baseName.split("/"),
                map = config.map,
                starMap = (map && map['*']) || {};

            //Adjust any relative paths.
            if (name && name.charAt(0) === ".") {
                //If have a base name, try to normalize against it,
                //otherwise, assume it is a top-level require that will
                //be relative to baseUrl in the end.
                if (baseName) {
                    //Convert baseName to array, and lop off the last part,
                    //so that . matches that "directory" and not name of the baseName's
                    //module. For instance, baseName of "one/two/three", maps to
                    //"one/two/three.js", but we want the directory, "one/two" for
                    //this normalization.
                    baseParts = baseParts.slice(0, baseParts.length - 1);
                    name = name.split('/');
                    lastIndex = name.length - 1;

                    // Node .js allowance:
                    if (config.nodeIdCompat && jsSuffixRegExp.test(name[lastIndex])) {
                        name[lastIndex] = name[lastIndex].replace(jsSuffixRegExp, '');
                    }

                    name = baseParts.concat(name);

                    //start trimDots
                    for (i = 0; i < name.length; i += 1) {
                        part = name[i];
                        if (part === ".") {
                            name.splice(i, 1);
                            i -= 1;
                        } else if (part === "..") {
                            if (i === 1 && (name[2] === '..' || name[0] === '..')) {
                                //End of the line. Keep at least one non-dot
                                //path segment at the front so it can be mapped
                                //correctly to disk. Otherwise, there is likely
                                //no path mapping for a path starting with '..'.
                                //This can still fail, but catches the most reasonable
                                //uses of ..
                                break;
                            } else if (i > 0) {
                                name.splice(i - 1, 2);
                                i -= 2;
                            }
                        }
                    }
                    //end trimDots

                    name = name.join("/");
                } else if (name.indexOf('./') === 0) {
                    // No baseName, so this is ID is resolved relative
                    // to baseUrl, pull off the leading dot.
                    name = name.substring(2);
                }
            }

            //Apply map config if available.
            if ((baseParts || starMap) && map) {
                nameParts = name.split('/');

                for (i = nameParts.length; i > 0; i -= 1) {
                    nameSegment = nameParts.slice(0, i).join("/");

                    if (baseParts) {
                        //Find the longest baseName segment match in the config.
                        //So, do joins on the biggest to smallest lengths of baseParts.
                        for (j = baseParts.length; j > 0; j -= 1) {
                            mapValue = map[baseParts.slice(0, j).join('/')];

                            //baseName segment has  config, find if it has one for
                            //this name.
                            if (mapValue) {
                                mapValue = mapValue[nameSegment];
                                if (mapValue) {
                                    //Match, update name to the new value.
                                    foundMap = mapValue;
                                    foundI = i;
                                    break;
                                }
                            }
                        }
                    }

                    if (foundMap) {
                        break;
                    }

                    //Check for a star map match, but just hold on to it,
                    //if there is a shorter segment match later in a matching
                    //config, then favor over this star map.
                    if (!foundStarMap && starMap && starMap[nameSegment]) {
                        foundStarMap = starMap[nameSegment];
                        starI = i;
                    }
                }

                if (!foundMap && foundStarMap) {
                    foundMap = foundStarMap;
                    foundI = starI;
                }

                if (foundMap) {
                    nameParts.splice(0, foundI, foundMap);
                    name = nameParts.join('/');
                }
            }

            return name;
        }

        function makeRequire(relName, forceSync) {
            return function () {
                //A version of a require function that passes a moduleName
                //value for items that may need to
                //look up paths relative to the moduleName
                var args = aps.call(arguments, 0);

                //If first arg is not require('string'), and there is only
                //one arg, it is the array form without a callback. Insert
                //a null so that the following concat is correct.
                if (typeof args[0] !== 'string' && args.length === 1) {
                    args.push(null);
                }
                return req.apply(undef, args.concat([relName, forceSync]));
            };
        }

        function makeNormalize(relName) {
            return function (name) {
                return normalize(name, relName);
            };
        }

        function makeLoad(depName) {
            return function (value) {
                defined[depName] = value;
            };
        }

        function callDep(name) {
            if (hasProp(waiting, name)) {
                var args = waiting[name];
                delete waiting[name];
                defining[name] = true;
                main.apply(undef, args);
            }

            if (!hasProp(defined, name) && !hasProp(defining, name)) {
                throw new Error('No ' + name);
            }
            return defined[name];
        }

        //Turns a plugin!resource to [plugin, resource]
        //with the plugin being undefined if the name
        //did not have a plugin prefix.
        function splitPrefix(name) {
            var prefix,
                index = name ? name.indexOf('!') : -1;
            if (index > -1) {
                prefix = name.substring(0, index);
                name = name.substring(index + 1, name.length);
            }
            return [prefix, name];
        }

        /**
         * Makes a name map, normalizing the name, and using a plugin
         * for normalization if necessary. Grabs a ref to plugin
         * too, as an optimization.
         */
        makeMap = function (name, relName) {
            var plugin,
                parts = splitPrefix(name),
                prefix = parts[0];

            name = parts[1];

            if (prefix) {
                prefix = normalize(prefix, relName);
                plugin = callDep(prefix);
            }

            //Normalize according
            if (prefix) {
                if (plugin && plugin.normalize) {
                    name = plugin.normalize(name, makeNormalize(relName));
                } else {
                    name = normalize(name, relName);
                }
            } else {
                name = normalize(name, relName);
                parts = splitPrefix(name);
                prefix = parts[0];
                name = parts[1];
                if (prefix) {
                    plugin = callDep(prefix);
                }
            }

            //Using ridiculous property names for space reasons
            return {
                f: prefix ? prefix + '!' + name : name, //fullName
                n: name,
                pr: prefix,
                p: plugin
            };
        };

        function makeConfig(name) {
            return function () {
                return (config && config.config && config.config[name]) || {};
            };
        }

        handlers = {
            require: function (name) {
                return makeRequire(name);
            },
            exports: function (name) {
                var e = defined[name];
                if (typeof e !== 'undefined') {
                    return e;
                } else {
                    return (defined[name] = {});
                }
            },
            module: function (name) {
                return {
                    id: name,
                    uri: '',
                    exports: defined[name],
                    config: makeConfig(name)
                };
            }
        };

        main = function (name, deps, callback, relName) {
            var cjsModule, depName, ret, map, i,
                args = [],
                callbackType = typeof callback,
                usingExports;

            //Use name if no relName
            relName = relName || name;

            //Call the callback to define the module, if necessary.
            if (callbackType === 'undefined' || callbackType === 'function') {
                //Pull out the defined dependencies and pass the ordered
                //values to the callback.
                //Default to [require, exports, module] if no deps
                deps = !deps.length && callback.length ? ['require', 'exports', 'module'] : deps;
                for (i = 0; i < deps.length; i += 1) {
                    map = makeMap(deps[i], relName);
                    depName = map.f;

                    //Fast path CommonJS standard dependencies.
                    if (depName === "require") {
                        args[i] = handlers.require(name);
                    } else if (depName === "exports") {
                        //CommonJS module spec 1.1
                        args[i] = handlers.exports(name);
                        usingExports = true;
                    } else if (depName === "module") {
                        //CommonJS module spec 1.1
                        cjsModule = args[i] = handlers.module(name);
                    } else if (hasProp(defined, depName) ||
                               hasProp(waiting, depName) ||
                               hasProp(defining, depName)) {
                        args[i] = callDep(depName);
                    } else if (map.p) {
                        map.p.load(map.n, makeRequire(relName, true), makeLoad(depName), {});
                        args[i] = defined[depName];
                    } else {
                        throw new Error(name + ' missing ' + depName);
                    }
                }

                ret = callback ? callback.apply(defined[name], args) : undefined;

                if (name) {
                    //If setting exports via "module" is in play,
                    //favor that over return value and exports. After that,
                    //favor a non-undefined return value over exports use.
                    if (cjsModule && cjsModule.exports !== undef &&
                            cjsModule.exports !== defined[name]) {
                        defined[name] = cjsModule.exports;
                    } else if (ret !== undef || !usingExports) {
                        //Use the return value from the function.
                        defined[name] = ret;
                    }
                }
            } else if (name) {
                //May just be an object definition for the module. Only
                //worry about defining if have a module name.
                defined[name] = callback;
            }
        };

        requirejs = require = req = function (deps, callback, relName, forceSync, alt) {
            if (typeof deps === "string") {
                if (handlers[deps]) {
                    //callback in this case is really relName
                    return handlers[deps](callback);
                }
                //Just return the module wanted. In this scenario, the
                //deps arg is the module name, and second arg (if passed)
                //is just the relName.
                //Normalize module name, if it contains . or ..
                return callDep(makeMap(deps, callback).f);
            } else if (!deps.splice) {
                //deps is a config object, not an array.
                config = deps;
                if (config.deps) {
                    req(config.deps, config.callback);
                }
                if (!callback) {
                    return;
                }

                if (callback.splice) {
                    //callback is an array, which means it is a dependency list.
                    //Adjust args if there are dependencies
                    deps = callback;
                    callback = relName;
                    relName = null;
                } else {
                    deps = undef;
                }
            }

            //Support require(['a'])
            callback = callback || function () {};

            //If relName is a function, it is an errback handler,
            //so remove it.
            if (typeof relName === 'function') {
                relName = forceSync;
                forceSync = alt;
            }

            //Simulate async callback;
            if (forceSync) {
                main(undef, deps, callback, relName);
            } else {
                //Using a non-zero value because of concern for what old browsers
                //do, and latest browsers "upgrade" to 4 if lower value is used:
                //http://www.whatwg.org/specs/web-apps/current-work/multipage/timers.html#dom-windowtimers-settimeout:
                //If want a value immediately, use require('id') instead -- something
                //that works in almond on the global level, but not guaranteed and
                //unlikely to work in other AMD implementations.
                setTimeout(function () {
                    main(undef, deps, callback, relName);
                }, 4);
            }

            return req;
        };

        /**
         * Just drops the config on the floor, but returns req in case
         * the config return value is used.
         */
        req.config = function (cfg) {
            return req(cfg);
        };

        /**
         * Expose module registry for debugging and tooling
         */
        requirejs._defined = defined;

        define = function (name, deps, callback) {

            //This module may not have dependencies
            if (!deps.splice) {
                //deps is not an array, so probably means
                //an object literal or factory function for
                //the value. Adjust args.
                callback = deps;
                deps = [];
            }

            if (!hasProp(defined, name) && !hasProp(waiting, name)) {
                waiting[name] = [name, deps, callback];
            }
        };

        define.amd = {
            jQuery: true
        };
    }());
});

//# sourceMappingURL=bundle.map
define(
    "MG",
    ["common/bootstrap_tooltip_popover", "common/chart_title", "common/register", "exports"],
    function(
        common$bootstrap_tooltip_popover$$,
        common$chart_title$$,
        common$register$$,
        __exports__) {
        "use strict";

        function __es6_export__(name, value) {
            __exports__[name] = value;
        }

        var chart_title;
        chart_title = common$chart_title$$["default"];
        var register;
        register = common$register$$["default"];

        var MG = { version: '2.1.0' };

        window.MG = MG;

        __es6_export__("chart_title", chart_title);
        __es6_export__("register", register);
        __es6_export__("default", MG);
    }
);

//# sourceMappingURL=bundle.map
define(
    "common/data_graphic",
    ["../misc/utility", "exports"],
    function($$$misc$utility$$, __exports__) {
        "use strict";

        function __es6_export__(name, value) {
            __exports__[name] = value;
        }

        var merge_with_defaults;
        merge_with_defaults = $$$misc$utility$$["merge_with_defaults"];
        var warn_deprecation;
        warn_deprecation = $$$misc$utility$$["warn_deprecation"];
        var deprecations = {
            rollover_callback: { replacement: 'mouseover', version: '2.0' },
            rollout_callback: { replacement: 'mouseout', version: '2.0' },
            show_years: { replacement: 'show_secondary_x_label', version: '2.1' }
        };


        __es6_export__("deprecations", deprecations);
        function data_graphic(args) {
            'use strict';
            var defaults = {
                missing_is_zero: false,       // if true, missing values will be treated as zeros
                legend: '' ,                  // an array identifying the labels for a chart's lines
                legend_target: '',            // if set, the specified element is populated with a legend
                error: '',                    // if set, a graph will show an error icon and log the error to the console
                animate_on_load: false,       // animate lines on load
                top: 40,                      // the size of the top margin
                bottom: 30,                   // the size of the bottom margin
                right: 10,                    // size of the right margin
                left: 50,                     // size of the left margin
                buffer: 8,                    // the buffer between the actual chart area and the margins
                width: 350,                   // the width of the entire graphic
                height: 220,                  // the height of the entire graphic
                full_width: false,            // sets the graphic width to be the width of the parent element and resizes dynamically
                full_height: false,           // sets the graphic width to be the width of the parent element and resizes dynamically
                small_height_threshold: 120,  // the height threshold for when smaller text appears
                small_width_threshold: 160,   // the width  threshold for when smaller text appears
                small_text: false,            // coerces small text regardless of graphic size
                xax_count: 6,                 // number of x axis ticks
                xax_tick_length: 5,           // x axis tick length
                yax_count: 5,                 // number of y axis ticks
                yax_tick_length: 5,           // y axis tick length
                x_extended_ticks: false,      // extends x axis ticks across chart - useful for tall charts
                y_extended_ticks: false,      // extends y axis ticks across chart - useful for long charts
                y_scale_type: 'linear',
                max_x: null,
                max_y: null,
                min_x: null,
                min_y: null,                  // if set, y axis starts at an arbitrary value
                min_y_from_data: false,       // if set, y axis will start at minimum value rather than at 0
                point_size: 2.5,              // the size of the dot that appears on a line on mouse-over
                x_accessor: 'date',
                xax_units: '',
                x_label: '',
                x_axis: true,
                y_axis: true,
                y_accessor: 'value',
                y_label: '',
                yax_units: '',
                x_rug: false,
                y_rug: false,
                transition_on_update: true,
                mouseover: null,
                show_rollover_text: true,
                show_confidence_band: null,   // given [l, u] shows a confidence at each point from l to u
                xax_format: null,             // xax_format is a function that formats the labels for the x axis.
                area: true,
                chart_type: 'line',
                data: [],
                decimals: 2,                  // the number of decimals in any rollover
                format: 'count',              // format = {count, percentage}
                inflator: 10/9,               // for setting y axis max
                linked: false,                // links together all other graphs with linked:true, so rollovers in one trigger rollovers in the others
                linked_format: '%Y-%m-%d',    // What granularity to link on for graphs. Default is at day
                list: false,
                baselines: null,              // sets the baseline lines
                markers: null,                // sets the marker lines
                scalefns: {},
                scales: {},
                show_secondary_x_label: true,
                target: '#viz',
                interpolate: 'cardinal',       // interpolation method to use when rendering lines
                custom_line_color_map: [],     // allows arbitrary mapping of lines to colors, e.g. [2,3] will map line 1 to color 2 and line 2 to color 3
                max_data_size: null,           // explicitly specify the the max number of line series, for use with custom_line_color_map
                aggregate_rollover: false,     // links the lines in a multi-line chart
                show_tooltips: true            // if enabled, a chart's description will appear in a tooltip (requires jquery)
            };

            if (!args) { args = {}; }

            args = merge_with_defaults(args, defaults);

            if (args.list) {
                args.x_accessor = 0;
                args.y_accessor = 1;
            }

            // check for deprecated parameters
            for (var key in MG.deprecations) {
                if (args.hasOwnProperty(key)) {
                    var deprecation = MG.deprecations[key],
                        message = 'Use of `args.' + key + '` has been deprecated',
                        replacement = deprecation.replacement,
                        version;

                    // transparently alias the deprecated
                    if (replacement) {
                        if (args[replacement]) {
                            message += '. The replacement - `args.' + replacement + '` - has already been defined. This definition will be discarded.';
                        } else {
                            args[replacement] = args[key];
                        }
                    }

                    if (deprecation.warned) {
                        continue;
                    }

                    deprecation.warned = true;

                    if (replacement) {
                        message += ' in favor of `args.' + replacement + '`';
                    }

                    warnDeprecation(message, deprecation.version);
                }
            }

            var selected_chart = MG.charts[args.chart_type];
            args = merge_with_defaults(args, selected_chart.defaults);
            new selected_chart.descriptor(args);

            return args.data;
        }
        __es6_export__("default", data_graphic);
    }
);

//# sourceMappingURL=bundle.map
define("common/register", ["../mg", "exports"], function($$$mg$$, __exports__) {
    "use strict";

    function __es6_export__(name, value) {
        __exports__[name] = value;
    }

    var MG;
    MG = $$$mg$$["default"];

    MG.register = function(chartType, descriptor, defaults) {
        MG.charts[chartType] = {
            descriptor: descriptor,
            defaults: defaults || {}
        };
    };
});

//# sourceMappingURL=bundle.map
define("common/bootstrap_tooltip_popover", ["exports"], function(__exports__) {
  "use strict";

  function __es6_export__(name, value) {
    __exports__[name] = value;
  }

  if (typeof jQuery !== 'undefined') {
      /*!
       * Bootstrap v3.3.1 (http://getbootstrap.com)
       * Copyright 2011-2014 Twitter, Inc.
       * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
       */

      /*!
       * Generated using the Bootstrap Customizer (http://getbootstrap.com/customize/?id=698666b23215c58f23d4)
       * Config saved to config.json and https://gist.github.com/698666b23215c58f23d4
       */

      /* ========================================================================
       * Bootstrap: tooltip.js v3.3.1
       * http://getbootstrap.com/javascript/#tooltip
       * Inspired by the original jQuery.tipsy by Jason Frame
       * ========================================================================
       * Copyright 2011-2014 Twitter, Inc.
       * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
       * ======================================================================== */


      +function ($) {
        'use strict';
        
        if(typeof $().tooltip == 'function')
          return true;

        // TOOLTIP PUBLIC CLASS DEFINITION
        // ===============================

        var Tooltip = function (element, options) {
          this.type       =
          this.options    =
          this.enabled    =
          this.timeout    =
          this.hoverState =
          this.$element   = null;

          this.init('tooltip', element, options);
        };

        Tooltip.VERSION  = '3.3.1';

        Tooltip.TRANSITION_DURATION = 150;

        Tooltip.DEFAULTS = {
          animation: true,
          placement: 'top',
          selector: false,
          template: '<div class="tooltip" role="tooltip"><div class="tooltip-arrow"></div><div class="tooltip-inner"></div></div>',
          trigger: 'hover focus',
          title: '',
          delay: 0,
          html: false,
          container: false,
          viewport: {
            selector: 'body',
            padding: 0
          }
        };

        Tooltip.prototype.init = function (type, element, options) {
          this.enabled   = true;
          this.type      = type;
          this.$element  = $(element);
          this.options   = this.getOptions(options);
          this.$viewport = this.options.viewport && $(this.options.viewport.selector || this.options.viewport);

          var triggers = this.options.trigger.split(' ');

          for (var i = triggers.length; i--;) {
            var trigger = triggers[i];

            if (trigger == 'click') {
              this.$element.on('click.' + this.type, this.options.selector, $.proxy(this.toggle, this));
            } else if (trigger != 'manual') {
              var eventIn  = trigger == 'hover' ? 'mouseenter' : 'focusin';
              var eventOut = trigger == 'hover' ? 'mouseleave' : 'focusout';

              this.$element.on(eventIn  + '.' + this.type, this.options.selector, $.proxy(this.enter, this));
              this.$element.on(eventOut + '.' + this.type, this.options.selector, $.proxy(this.leave, this));
            }
          }

          this.options.selector ?
            (this._options = $.extend({}, this.options, { trigger: 'manual', selector: '' })) :
            this.fixTitle();
        };

        Tooltip.prototype.getDefaults = function () {
          return Tooltip.DEFAULTS;
        };

        Tooltip.prototype.getOptions = function (options) {
          options = $.extend({}, this.getDefaults(), this.$element.data(), options);

          if (options.delay && typeof options.delay == 'number') {
            options.delay = {
              show: options.delay,
              hide: options.delay
            };
          }

          return options;
        };

        Tooltip.prototype.getDelegateOptions = function () {
          var options  = {};
          var defaults = this.getDefaults();

          this._options && $.each(this._options, function (key, value) {
            if (defaults[key] != value) options[key] = value;
          });

          return options;
        };

        Tooltip.prototype.enter = function (obj) {
          var self = obj instanceof this.constructor ?
            obj : $(obj.currentTarget).data('bs.' + this.type);

          if (self && self.$tip && self.$tip.is(':visible')) {
            self.hoverState = 'in';
            return;
          }

          if (!self) {
            self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
            $(obj.currentTarget).data('bs.' + this.type, self);
          }

          clearTimeout(self.timeout);

          self.hoverState = 'in';

          if (!self.options.delay || !self.options.delay.show) return self.show();

          self.timeout = setTimeout(function () {
            if (self.hoverState == 'in') self.show();
          }, self.options.delay.show);
        };

        Tooltip.prototype.leave = function (obj) {
          var self = obj instanceof this.constructor ?
            obj : $(obj.currentTarget).data('bs.' + this.type);

          if (!self) {
            self = new this.constructor(obj.currentTarget, this.getDelegateOptions());
            $(obj.currentTarget).data('bs.' + this.type, self);
          }

          clearTimeout(self.timeout);

          self.hoverState = 'out';

          if (!self.options.delay || !self.options.delay.hide) return self.hide();

          self.timeout = setTimeout(function () {
            if (self.hoverState == 'out') self.hide();
          }, self.options.delay.hide);
        };

        Tooltip.prototype.show = function () {
          var e = $.Event('show.bs.' + this.type);

          if (this.hasContent() && this.enabled) {
            this.$element.trigger(e);

            var inDom = $.contains(this.$element[0].ownerDocument.documentElement, this.$element[0]);
            if (e.isDefaultPrevented() || !inDom) return;
            var that = this;

            var $tip = this.tip();

            var tipId = this.getUID(this.type);

            this.setContent();
            $tip.attr('id', tipId);
            this.$element.attr('aria-describedby', tipId);

            if (this.options.animation) $tip.addClass('fade');

            var placement = typeof this.options.placement == 'function' ?
              this.options.placement.call(this, $tip[0], this.$element[0]) :
              this.options.placement;

            var autoToken = /\s?auto?\s?/i;
            var autoPlace = autoToken.test(placement);
            if (autoPlace) placement = placement.replace(autoToken, '') || 'top';

            $tip
              .detach()
              .css({ top: 0, left: 0, display: 'block' })
              .addClass(placement)
              .data('bs.' + this.type, this);

            this.options.container ? $tip.appendTo(this.options.container) : $tip.insertAfter(this.$element);

            var pos          = this.getPosition();
            var actualWidth  = $tip[0].offsetWidth;
            var actualHeight = $tip[0].offsetHeight;

            if (autoPlace) {
              var orgPlacement = placement;
              var $container   = this.options.container ? $(this.options.container) : this.$element.parent();
              var containerDim = this.getPosition($container);

              placement = placement == 'bottom' && pos.bottom + actualHeight > containerDim.bottom ? 'top'    :
                          placement == 'top'    && pos.top    - actualHeight < containerDim.top    ? 'bottom' :
                          placement == 'right'  && pos.right  + actualWidth  > containerDim.width  ? 'left'   :
                          placement == 'left'   && pos.left   - actualWidth  < containerDim.left   ? 'right'  :
                          placement;

              $tip
                .removeClass(orgPlacement)
                .addClass(placement);
            }

            var calculatedOffset = this.getCalculatedOffset(placement, pos, actualWidth, actualHeight);

            this.applyPlacement(calculatedOffset, placement);

            var complete = function () {
              var prevHoverState = that.hoverState;
              that.$element.trigger('shown.bs.' + that.type);
              that.hoverState = null;

              if (prevHoverState == 'out') that.leave(that);
            };

            $.support.transition && this.$tip.hasClass('fade') ?
              $tip
                .one('bsTransitionEnd', complete)
                .emulateTransitionEnd(Tooltip.TRANSITION_DURATION) :
              complete();
          }
        };

        Tooltip.prototype.applyPlacement = function (offset, placement) {
          var $tip   = this.tip();
          var width  = $tip[0].offsetWidth;
          var height = $tip[0].offsetHeight;

          // manually read margins because getBoundingClientRect includes difference
          var marginTop = parseInt($tip.css('margin-top'), 10);
          var marginLeft = parseInt($tip.css('margin-left'), 10);

          // we must check for NaN for ie 8/9
          if (isNaN(marginTop))  marginTop  = 0;
          if (isNaN(marginLeft)) marginLeft = 0;

          offset.top  = offset.top  + marginTop;
          offset.left = offset.left + marginLeft;

          // $.fn.offset doesn't round pixel values
          // so we use setOffset directly with our own function B-0
          $.offset.setOffset($tip[0], $.extend({
            using: function (props) {
              $tip.css({
                top: Math.round(props.top),
                left: Math.round(props.left)
              });
            }
          }, offset), 0);

          $tip.addClass('in');

          // check to see if placing tip in new offset caused the tip to resize itself
          var actualWidth  = $tip[0].offsetWidth;
          var actualHeight = $tip[0].offsetHeight;

          if (placement == 'top' && actualHeight != height) {
            offset.top = offset.top + height - actualHeight;
          }

          var delta = this.getViewportAdjustedDelta(placement, offset, actualWidth, actualHeight);

          if (delta.left) offset.left += delta.left;
          else offset.top += delta.top;

          var isVertical          = /top|bottom/.test(placement);
          var arrowDelta          = isVertical ? delta.left * 2 - width + actualWidth : delta.top * 2 - height + actualHeight;
          var arrowOffsetPosition = isVertical ? 'offsetWidth' : 'offsetHeight';

          $tip.offset(offset);
          this.replaceArrow(arrowDelta, $tip[0][arrowOffsetPosition], isVertical);
        };

        Tooltip.prototype.replaceArrow = function (delta, dimension, isHorizontal) {
          this.arrow()
            .css(isHorizontal ? 'left' : 'top', 50 * (1 - delta / dimension) + '%')
            .css(isHorizontal ? 'top' : 'left', '');
        };

        Tooltip.prototype.setContent = function () {
          var $tip  = this.tip();
          var title = this.getTitle();

          $tip.find('.tooltip-inner')[this.options.html ? 'html' : 'text'](title);
          $tip.removeClass('fade in top bottom left right');
        };

        Tooltip.prototype.hide = function (callback) {
          var that = this;
          var $tip = this.tip();
          var e    = $.Event('hide.bs.' + this.type);

          function complete() {
            if (that.hoverState != 'in') $tip.detach();
            that.$element
              .removeAttr('aria-describedby')
              .trigger('hidden.bs.' + that.type);
            callback && callback();
          }

          this.$element.trigger(e);

          if (e.isDefaultPrevented()) return;

          $tip.removeClass('in');

          $.support.transition && this.$tip.hasClass('fade') ?
            $tip
              .one('bsTransitionEnd', complete)
              .emulateTransitionEnd(Tooltip.TRANSITION_DURATION) :
            complete();

          this.hoverState = null;

          return this;
        };

        Tooltip.prototype.fixTitle = function () {
          var $e = this.$element;
          if ($e.attr('title') || typeof ($e.attr('data-original-title')) != 'string') {
            $e.attr('data-original-title', $e.attr('title') || '').attr('title', '');
          }
        };

        Tooltip.prototype.hasContent = function () {
          return this.getTitle();
        };

        Tooltip.prototype.getPosition = function ($element) {
          $element   = $element || this.$element;

          var el     = $element[0];
          var isBody = el.tagName == 'BODY';

          var elRect    = el.getBoundingClientRect();
          if (elRect.width == null) {
            // width and height are missing in IE8, so compute them manually; see https://github.com/twbs/bootstrap/issues/14093
            elRect = $.extend({}, elRect, { width: elRect.right - elRect.left, height: elRect.bottom - elRect.top });
          }
          var elOffset  = isBody ? { top: 0, left: 0 } : $element.offset();
          var scroll    = { scroll: isBody ? document.documentElement.scrollTop || document.body.scrollTop : $element.scrollTop() };
          var outerDims = isBody ? { width: $(window).width(), height: $(window).height() } : null;

          return $.extend({}, elRect, scroll, outerDims, elOffset);
        };

        Tooltip.prototype.getCalculatedOffset = function (placement, pos, actualWidth, actualHeight) {
          return placement == 'bottom' ? { top: pos.top + pos.height,   left: pos.left + pos.width / 2 - actualWidth / 2  } :
                 placement == 'top'    ? { top: pos.top - actualHeight, left: pos.left + pos.width / 2 - actualWidth / 2  } :
                 placement == 'left'   ? { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left - actualWidth } :
              /* placement == 'right' */ { top: pos.top + pos.height / 2 - actualHeight / 2, left: pos.left + pos.width   };

        };

        Tooltip.prototype.getViewportAdjustedDelta = function (placement, pos, actualWidth, actualHeight) {
          var delta = { top: 0, left: 0 };
          if (!this.$viewport) return delta;

          var viewportPadding = this.options.viewport && this.options.viewport.padding || 0;
          var viewportDimensions = this.getPosition(this.$viewport);

          if (/right|left/.test(placement)) {
            var topEdgeOffset    = pos.top - viewportPadding - viewportDimensions.scroll;
            var bottomEdgeOffset = pos.top + viewportPadding - viewportDimensions.scroll + actualHeight;
            if (topEdgeOffset < viewportDimensions.top) { // top overflow
              delta.top = viewportDimensions.top - topEdgeOffset;
            } else if (bottomEdgeOffset > viewportDimensions.top + viewportDimensions.height) { // bottom overflow
              delta.top = viewportDimensions.top + viewportDimensions.height - bottomEdgeOffset;
            }
          } else {
            var leftEdgeOffset  = pos.left - viewportPadding;
            var rightEdgeOffset = pos.left + viewportPadding + actualWidth;
            if (leftEdgeOffset < viewportDimensions.left) { // left overflow
              delta.left = viewportDimensions.left - leftEdgeOffset;
            } else if (rightEdgeOffset > viewportDimensions.width) { // right overflow
              delta.left = viewportDimensions.left + viewportDimensions.width - rightEdgeOffset;
            }
          }

          return delta;
        };

        Tooltip.prototype.getTitle = function () {
          var title;
          var $e = this.$element;
          var o  = this.options;

          title = $e.attr('data-original-title')
            || (typeof o.title == 'function' ? o.title.call($e[0]) :  o.title);

          return title;
        };

        Tooltip.prototype.getUID = function (prefix) {
          do prefix += ~~(Math.random() * 1000000);
          while (document.getElementById(prefix));
          return prefix;
        };

        Tooltip.prototype.tip = function () {
          return (this.$tip = this.$tip || $(this.options.template));
        };

        Tooltip.prototype.arrow = function () {
          return (this.$arrow = this.$arrow || this.tip().find('.tooltip-arrow'));
        };

        Tooltip.prototype.enable = function () {
          this.enabled = true;
        };

        Tooltip.prototype.disable = function () {
          this.enabled = false;
        };

        Tooltip.prototype.toggleEnabled = function () {
          this.enabled = !this.enabled;
        };

        Tooltip.prototype.toggle = function (e) {
          var self = this;
          if (e) {
            self = $(e.currentTarget).data('bs.' + this.type);
            if (!self) {
              self = new this.constructor(e.currentTarget, this.getDelegateOptions());
              $(e.currentTarget).data('bs.' + this.type, self);
            }
          }

          self.tip().hasClass('in') ? self.leave(self) : self.enter(self);
        };

        Tooltip.prototype.destroy = function () {
          var that = this;
          clearTimeout(this.timeout);
          this.hide(function () {
            that.$element.off('.' + that.type).removeData('bs.' + that.type);
          });
        };


        // TOOLTIP PLUGIN DEFINITION
        // =========================

        function Plugin(option) {
          return this.each(function () {
            var $this    = $(this);
            var data     = $this.data('bs.tooltip');
            var options  = typeof option == 'object' && option;
            var selector = options && options.selector;

            if (!data && option == 'destroy') return;
            if (selector) {
              if (!data) $this.data('bs.tooltip', (data = {}));
              if (!data[selector]) data[selector] = new Tooltip(this, options);
            } else {
              if (!data) $this.data('bs.tooltip', (data = new Tooltip(this, options)));
            }
            if (typeof option == 'string') data[option]();
          });
        }

        var old = $.fn.tooltip;

        $.fn.tooltip             = Plugin;
        $.fn.tooltip.Constructor = Tooltip;


        // TOOLTIP NO CONFLICT
        // ===================

        $.fn.tooltip.noConflict = function () {
          $.fn.tooltip = old;
          return this;
        };

      }(jQuery);

      /* ========================================================================
       * Bootstrap: popover.js v3.3.1
       * http://getbootstrap.com/javascript/#popovers
       * ========================================================================
       * Copyright 2011-2014 Twitter, Inc.
       * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
       * ======================================================================== */


      +function ($) {
        'use strict';

        if(typeof $().popover == 'function')
          return true;
            
        // POPOVER PUBLIC CLASS DEFINITION
        // ===============================

        var Popover = function (element, options) {
          this.init('popover', element, options);
        };

        if (!$.fn.tooltip) throw new Error('Popover requires tooltip.js');

        Popover.VERSION  = '3.3.1';

        Popover.DEFAULTS = $.extend({}, $.fn.tooltip.Constructor.DEFAULTS, {
          placement: 'right',
          trigger: 'click',
          content: '',
          template: '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-title"></h3><div class="popover-content"></div></div>'
        });


        // NOTE: POPOVER EXTENDS tooltip.js
        // ================================

        Popover.prototype = $.extend({}, $.fn.tooltip.Constructor.prototype);

        Popover.prototype.constructor = Popover;

        Popover.prototype.getDefaults = function () {
          return Popover.DEFAULTS;
        };

        Popover.prototype.setContent = function () {
          var $tip    = this.tip();
          var title   = this.getTitle();
          var content = this.getContent();

          $tip.find('.popover-title')[this.options.html ? 'html' : 'text'](title);
          $tip.find('.popover-content').children().detach().end()[ // we use append for html objects to maintain js events
            this.options.html ? (typeof content == 'string' ? 'html' : 'append') : 'text'
          ](content);

          $tip.removeClass('fade top bottom left right in');

          // IE8 doesn't accept hiding via the `:empty` pseudo selector, we have to do
          // this manually by checking the contents.
          if (!$tip.find('.popover-title').html()) $tip.find('.popover-title').hide();
        };

        Popover.prototype.hasContent = function () {
          return this.getTitle() || this.getContent();
        };

        Popover.prototype.getContent = function () {
          var $e = this.$element;
          var o  = this.options;

          return $e.attr('data-content')
            || (typeof o.content == 'function' ?
                  o.content.call($e[0]) :
                  o.content);
        };

        Popover.prototype.arrow = function () {
          return (this.$arrow = this.$arrow || this.tip().find('.arrow'));
        };

        Popover.prototype.tip = function () {
          if (!this.$tip) this.$tip = $(this.options.template);
          return this.$tip;
        };


        // POPOVER PLUGIN DEFINITION
        // =========================

        function Plugin(option) {
          return this.each(function () {
            var $this    = $(this);
            var data     = $this.data('bs.popover');
            var options  = typeof option == 'object' && option;
            var selector = options && options.selector;

            if (!data && option == 'destroy') return;
            if (selector) {
              if (!data) $this.data('bs.popover', (data = {}));
              if (!data[selector]) data[selector] = new Popover(this, options);
            } else {
              if (!data) $this.data('bs.popover', (data = new Popover(this, options)));
            }
            if (typeof option == 'string') data[option]();
          });
        }

        var old = $.fn.popover;

        $.fn.popover             = Plugin;
        $.fn.popover.Constructor = Popover;


        // POPOVER NO CONFLICT
        // ===================

        $.fn.popover.noConflict = function () {
          $.fn.popover = old;
          return this;
        };

      }(jQuery);
  }
});

//# sourceMappingURL=bundle.map
define(
    "common/chart_title",
    ["./bootstrap_tooltip_popover", "../misc/error", "exports"],
    function(common$bootstrap_tooltip_popover$$, $$$misc$error$$, __exports__) {
        "use strict";

        function __es6_export__(name, value) {
            __exports__[name] = value;
        }

        var popover;
        popover = common$bootstrap_tooltip_popover$$["default"];
        var error;
        error = $$$misc$error$$["default"];
        function chart_title(args) {
            'use strict';

            var container = d3.select(args.target);

            // remove the current title if it exists
            container.select('.mg-chart-title').remove();

            if (args.target && args.title) {
                //only show question mark if there's a description
                var optional_question_mark = (args.show_tooltips && args.description)
                    ? '<i class="fa fa-question-circle fa-inverse description"></i>'
                    : '';

                container.insert('h2', ':first-child')
                    .attr('class', 'mg-chart-title')
                    .html(args.title + optional_question_mark);

                //activate the question mark if we have a description
                if (args.show_tooltips && args.description) {
                    var $newTitle = $(container.node()).find('h2.mg-chart-title');

                    $newTitle.popover({
                        html: true,
                        animation: false,
                        content: args.description,
                        trigger: 'hover',
                        placement: 'top',
                        container: $newTitle
                    });
                }
            }

            if (args.error) {
                error(args);
            }
        }
        __es6_export__("default", chart_title);
    }
);

//# sourceMappingURL=bundle.map
//# sourceMappingURL=metricsgraphics.js.map