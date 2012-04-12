/**
 * Router some kind of man in the middle,
 * who deside what user wants to, taping some url
 */
exports.instance = function (Lib) {
  var Router = function () {
    this._routes = [];
    this._prepareRoutes();
  };
  Router.prototype = {
    _prepareRoutes: function (routes) {
      var reg,
        route;
      routes = routes || this.ROUTES;
      for (route in routes) {
        reg = new RegExp(route);
        this._routes.push([ reg, routes[route] ]);
      }
    },
    _parse: function (request) {
      var params = {
          req: request
        },
        path = request.pathname,
        match,
        i;
      for (i = 0; i < this._routes.length; i++) {
        match = path.match(this._routes[i][0]);
        if (match) {
          params.routeMatches = match;
          params.routeObj = this._routes[i][1];
          return params;
        }
      }
      return null;
    },
    _modelAndAction: function (params, response) {
      var route = params.routeObj,
        model = Lib(route.model);
      if (!model || typeof model[route.action] !== 'function') {
        Lib('console').error([
          'no such model "',
          route.model,
          '" or action "',
          route.action,
          '"'
        ].join(''));
        response.error(404);
        return;
      }
      model[route.action].call(model, params);
    },
    /**
     * Parse url, detect route and execute it
     *
     * @param {string} url 
     * @param {object} response Wrapped native http response
     */
    execute: function (request, response) {
      var params = this._parse(request),
        route;
      if (params === null) {
        response.error(404);
        return;
      }
      params.request = request;
      params.response = response;
      route = params.routeObj;
      if (route.model && route.action) {
        this._modelAndAction(params, response);
        return;
      }
      response.error(404);
    },
    /**
     * Allow to compete route table
     *
     * @param {object|string} routes|routeName
     * @param {object} [route]
     */
    addRoutes: function (routeName, route) {
      var routes = arguments.length === 2 ?
                   {routeName: route} :
                   routeName;
      this._prepareRoutes(routes);
    }
  };
  return Router;
};
