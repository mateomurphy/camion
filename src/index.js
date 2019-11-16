var createError = require('http-errors');
var debugGraphql = require('debug')('graphql')
var fs = require('fs');
var path = require('path');
var request = require('graphql-request').request;
var Route = require('route-parser');
var YAML = require('yamljs');

var dir = process.cwd()

// load config
var config = YAML.load('config.yml')
var routes = config.routes

// load translations
var normalizedPath = path.join(dir, "locales");
var localeData = {}
fs.readdirSync(normalizedPath).forEach(function(file) {
  localeData = Object.assign(localeData, YAML.load(path.join(normalizedPath, file)))
});

function fullUrl(req) {
  return req.protocol + '://' + req.get('host') + req.originalUrl
}

function handleRoute(req, res, routeConfig, matches) {
  var params = Object.assign({ path: req.url, url: fullUrl(req) }, matches, req.query)
  var meta = Object.assign({}, config.meta)
  var layout = routeConfig.layout || 'default'

  // TODO support other defaults
  if (!['en', 'fr'].includes(params.locale)) {
    params.locale = 'en'
  }

  if (routeConfig.status) {
    res.status(routeConfig.status)
  }

  if (routeConfig.query) {
    debugGraphql(params)
    return request(process.env.API_URL, routeConfig.query, params).then(data => {
      debugGraphql(data)
      data.params = params
      data.meta = meta
      data.blocks = {}
      data.localeData = localeData[params.locale]
      data.layout = 'layouts/' + layout
      res.render(routeConfig.template, data);
    })
  } else {
    return new Promise(() => {
      res.render(routeConfig.template, {
        params: params,
        blocks: {},
        meta: meta,
        localeData: localeData[params.locale],
        layout: 'layouts/' + layout
      });
    })
  }
}

module.exports.router = function(req, res, next) {
  if (path.extname(req.url)) {
    return next()
  }

  for (var name in routes) {
    var routeConfig = routes[name]
    var paths = routeConfig.path

    if (!Array.isArray(paths)) {
      paths = [paths]
    }

    for (var index in paths) {
      routePath = paths[index]
      var route = new Route(routePath + '(/)');

      var matches = route.match(req.url)

      if (matches) {
        return handleRoute(req, res, routeConfig, matches).catch(err => next(err))
      }
    }
  }

  next(createError(404));
}

module.exports.errorHandler = function(err, req, res, next) {
  console.error(err);

  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render('error', { layout: false });
}
