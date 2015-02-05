MG.register = function(chartType, descriptor, defaults) {
    MG.charts[chartType] = {
        descriptor: descriptor,
        defaults: defaults || {}
    };
};
