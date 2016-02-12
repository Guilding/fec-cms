'use strict';

var $ = require('jquery');
var URI = require('urijs');
var _ = require('underscore');
var moment = require('moment');

var urls = require('fec-style/js/urls');
var dropdown = require('fec-style/js/dropdowns');
var Handlebars = require('hbsfy/runtime');
var helpers = require('fec-style/js/helpers');

Handlebars.registerHelper(helpers.helpers);

require('fullcalendar');

var templates = {
  details: require('../hbs/calendar/details.hbs'),
  download: require('../hbs/calendar/download.hbs'),
  subscribe: require('../hbs/calendar/subscribe.hbs'),
  events: require('../hbs/calendar/events.hbs'),
  listToggles: require('../hbs/calendar/listToggles.hbs')
};

function Listeners() {
  this.listeners = [];
}

Listeners.prototype.on = function($elm) {
  var args = _.toArray(arguments).slice(1);
  this.listeners = this._listeners || [];
  this.listeners.push({$elm: $elm, args: args});
  $elm.on.apply($elm, args);
};

Listeners.prototype.off = function() {
  this.listeners.forEach(function(listener) {
    var $elm = listener.$elm;
    var args = listener.args;
    $elm.off.apply($elm, args);
  });
};

var FC = $.fullCalendar;
var View = FC.View;

var categories = {
  Elections: ['election'],
  Deadlines: ['report', 'ie', 'ec'],
  Outreach: ['roundtables', 'conferences'],
  Meetings: ['open', 'executive'],
  Rules: ['aos'],
  Other: ['litigation', 'fea']
};

var categoriesInverse = _.reduce(_.pairs(categories), function(memo, pair) {
  var key = pair[0];
  var values = pair[1];
  _.each(values, function(value) {
    memo[value] = key;
  });
  return memo;
}, {});

var categoryGroups = function(events, start, end) {
  return _.chain(events)
    .filter(function(event) {
      return start <= event.start && event.start < end;
    })
    .sortBy('start')
    .groupBy(function(event) {
      var category = event.category ? event.category.split(/[ -]+/)[0].toLowerCase() : null;
      return categoriesInverse[category];
    })
    .map(function(values, key) {
      return {
        title: key,
        events: values
      };
    })
    .sortBy(function(group) {
      return Object.keys(categories).indexOf(group.title);
    })
    .value();
};

var chronologicalGroups = function(events, start, end) {
  events = _.chain(events)
    .filter(function(event) {
      return start <= event.start && event.start < end;
    })
    .sortBy('start')
    .value();
  return [{events: events}];
};

var ListView = View.extend({
  setDate: function(date) {
    var intervalUnit = this.options.duration.intervalUnit || this.intervalUnit;
    View.prototype.setDate.call(this, date.startOf(intervalUnit));
  },

  renderEvents: function(events) {
    var groups = this.options.categories ?
      categoryGroups(events, this.start, this.end) :
      chronologicalGroups(events, this.start, this.end);
    var settings = {
      duration: this.options.duration.intervalUnit,
      sortBy: this.options.sortBy
    };
    this.el.html(templates.events({groups: groups, settings: settings}));
    this.dropdowns = $(this.el.html).find('.dropdown').map(function(idx, elm) {
      return new dropdown.Dropdown($(elm), {checkboxes: false});
    });
  },

  unrenderEvents: function() {
    this.dropdowns.each(function(idx, dropdown) {
      dropdown.destroy();
    });
    this.el.html('');
  }
});

FC.views.list = ListView;

var LIST_VIEWS = ['quarterTime', 'quarterCategory', 'monthTime', 'monthCategory'];

function Calendar(opts) {
  this.opts = $.extend({}, this.defaultOpts(), opts);

  this.$calendar = $(this.opts.selector);
  this.$calendar.fullCalendar(this.opts.calendarOpts);
  this.url = URI(this.opts.url);
  this.exportUrl = URI(this.opts.exportUrl);
  this.filterPanel = this.opts.filterPanel;
  this.filterSet = this.filterPanel.filterSet;

  this.popoverId = 'calendar-popover';
  this.detailsId = 'calendar-details';

  this.sources = null;
  this.params = null;

  this.$download = $(opts.download);
  this.$subscribe = $(opts.subscribe);

  this.$calendar.on('calendar:rendered', this.filterPanel.setHeight());
  this.$calendar.on('click', '.js-toggle-view', this.toggleListView.bind(this));

  this.$calendar.on('keypress', '.fc-content, .fc-more, .fc-close', this.simulateClick.bind(this));
  this.$calendar.on('click', '.fc-more', this.managePopoverControl.bind(this));

  this.filterPanel.$form.on('change', this.filter.bind(this));
  $(window).on('popstate', this.filter.bind(this));

  urls.updateQuery(this.filterSet.serialize(), this.filterSet.fields);

  this.filter();
  this.styleButtons();
  this.filterPanel.setHeight();
}

Calendar.prototype.toggleListView = function(e) {
  var newView = $(e.target).data('trigger-view');
  this.$calendar.fullCalendar('changeView', newView);
};

Calendar.prototype.defaultOpts = function() {
  return {
    calendarOpts: {
      header: {
        left: 'prev,next today',
        center: 'title',
        right: 'agendaWeek,month,quarterCategory'
      },
      buttonIcons: false,
      buttonText: {
        today: 'Today',
        week: 'Week',
      },
      dayRender: this.handleDayRender.bind(this),
      dayPopoverFormat: 'MMM D, YYYY',
      defaultView: this.defaultView(),
      eventAfterAllRender: this.handleRender.bind(this),
      eventClick: this.handleEventClick.bind(this),
      eventLimit: true,
      nowIndicator: true,
      views: {
        agenda: {
          scrollTime: '09:00:00',
          minTime: '08:00:00',
          maxTime: '20:00:00'
        },
        month: {
          eventLimit: 3,
          buttonText: 'Month'
        },
        quarterCategory: {
          type: 'list',
          buttonText: 'Quarter',
          categories: true,
          sortBy: 'category',
          duration: {quarters: 1, intervalUnit: 'quarter'}
        },
        quarterTime: {
          type: 'list',
          sortBy: 'time',
          duration: {quarters: 1, intervalUnit: 'quarter'}
        },
        monthCategory: {
          type: 'list',
          categories: true,
          sortBy: 'category',
          duration: {months: 1, intervalUnit: 'month'}
        },
        monthTime: {
          type: 'list',
          sortBy: 'time',
          duration: {months: 1, intervalUnit: 'month'}
        },
      }
    },
    sourceOpts: {
      startParam: 'min_start_date',
      endParam: 'max_start_date',
      success: this.success.bind(this)
    }
  };
};

Calendar.prototype.filter = function() {
  var params = this.filterSet.serialize();
  if (_.isEqual(params, this.params)) {
    return;
  }
  var url = this.url.clone().addQuery(params || {}).toString();
  urls.pushQuery(this.filterSet.serialize(), this.filterSet.fields);
  this.$calendar.fullCalendar('removeEventSource', this.sources);
  this.sources = $.extend({}, this.opts.sourceOpts, {url: url});
  this.$calendar.fullCalendar('addEventSource', this.sources);
  this.updateLinks(params);
  this.params = params;
};

Calendar.prototype.success = function(response) {
  var self = this;
  return response.results.map(function(event) {
    var processed = {
      category: event.category,
      location: event.location,
      title: event.description || 'Event title',
      summary: event.summary || 'Event summary',
      state: event.state ? event.state.join(', ') : null,
      start: event.start_date ? moment.utc(event.start_date) : null,
      end: event.end_date ? moment.utc(event.end_date) : null,
      allDay: moment.utc(event.start_date).format('HHmmss') === '000000' && event.end_date === null,
      className: getEventClass(event),
      detailUrl: event.url
    };
    _.extend(processed, {
      google: getGoogleUrl(processed),
      download: self.exportUrl.clone().addQuery({event_id: event.event_id}).toString()
    });
    return processed;
  });
};

Calendar.prototype.updateLinks = function(params) {
  var url = this.exportUrl.clone().addQuery(params || {});
  var urls = {
    ics: url.toString(),
    csv: url.clone().query({renderer: 'csv'}).toString(),
    // Note: The cid parameter silently rejects https links; use http and allow
    // the backend to redirect to https
    google: 'https://calendar.google.com/calendar/render?cid=' +
      encodeURIComponent(url.clone().protocol('http').toString()),
    calendar: url.protocol('webcal').toString()
  };
  this.$download.html(templates.download(urls));
  this.$subscribe.html(templates.subscribe(urls));

  if (this.downloadButton) {
    this.downloadButton.destroy();
  }

  if (this.subscribeButton) {
    this.subscribeButton.destroy();
  }

  this.downloadButton = new dropdown.Dropdown(this.$download, {checkboxes: false});
  this.subscribeButton = new dropdown.Dropdown(this.$subscribe, {checkboxes: false});
};

Calendar.prototype.styleButtons = function() {
  var baseClasses = 'button button--neutral';
  this.$calendar.find('.fc-button').addClass(baseClasses);
  this.$calendar.find('.fc-next-button').addClass('button--next');
  this.$calendar.find('.fc-prev-button').addClass('button--previous');
  this.$calendar.find('.fc-right .fc-button-group').addClass('toggles--buttons');
};

Calendar.prototype.defaultView = function() {
  if ($(document).width() < helpers.BREAKPOINTS.MEDIUM) {
    return 'monthTime';
  } else {
    return 'month';
  }
};

Calendar.prototype.handleRender = function(view) {
  $(document.body).trigger($.Event('calendar:rendered'));
  this.highlightToday();
  if (LIST_VIEWS.indexOf(view.name) !== -1) {
    this.manageListToggles(view);
  } else if (this.$listToggles) {
    this.$listToggles.remove();
  }
  this.$calendar.find('.fc-content').attr({'tabindex': '0', 'aria-describedby': this.detailsId});
  this.$calendar.find('.fc-more').attr({'tabindex': '0', 'aria-describedby': this.popoverId});
};

Calendar.prototype.manageListToggles = function(view) {
  if (!this.$listToggles) {
    this.$listToggles = $('<div class="cal-list__toggles"></div>');
    this.$listToggles.prependTo(this.$calendar.find('.fc-view-container'));
  }
  this.$listToggles.html(templates.listToggles(view.options));
  // Highlight the quarter button on quarterTime
  if (view.name === 'quarterTime') {
    this.$calendar.find('.fc-quarterCategory-button').addClass('fc-state-active');
  }
};

Calendar.prototype.handleDayRender = function(date, cell) {
  if (date.date() === 1) {
    cell.append(date.format('MMMM'));
  }
};

Calendar.prototype.handleEventClick = function(calEvent, jsEvent, view) {
  var $target = $(jsEvent.target);
  if (!$target.closest('.tooltip').length) {
    var calEvent = _.extend({}, calEvent, {detailsId: this.detailsId});
    var $eventContainer = $target.closest('.fc-content');
    var tooltip = new CalendarTooltip(templates.details(calEvent), $eventContainer.parent());
    $eventContainer.append(tooltip.$content);
  }
};

// Simulate clicks when hitting enter on certain full-calendar elements
Calendar.prototype.simulateClick = function(e) {
  if (e.keyCode === 13) {
    $(e.target).click();
  }
};

Calendar.prototype.managePopoverControl = function(e) {
  var $target = $(e.target);
  var $popover = this.$calendar.find('.fc-popover');
  $popover.attr('id', this.popoverId).attr('role', 'tooltip');
  $popover.find('.fc-close')
    .attr('tabindex', '0')
    .focus()
    .on('click', function() {
      $target.focus();
    });
  $popover.find('.fc-content').attr('tabindex', '0');
};

Calendar.prototype.highlightToday = function() {
  var $today = this.$calendar.find('thead .fc-today');
  var todayIndex = $today.index() + 1;
  $today
    .closest('table')
    .find('tbody tr td:nth-child(' + todayIndex + ')')
    .addClass('fc-today');
};

var classMap = {
  aos: 'fc--rules',
  election: 'fc--election',
  report: 'fc--deadline',
  open: 'fc--meeting',
  executive: 'fc--meeting',
  roundtables: 'fc--outreach',
  conferences: 'fc--outreach',
  litigation: 'fc--other',
  fea: 'fc--other',
  ie: 'fc--deadline',
  ec: 'fc--deadline'
};

function getEventClass(event) {
  var className = 'fc--allday';
  var category = event.category ? event.category.split(/[ -]+/)[0] : null;
  className += category ? ' ' + classMap[category.toLowerCase()] : '';
  return className;
}

function getGoogleUrl(event) {
  var fmt, dates;
  if (event.end) {
    fmt = 'YYYYMMDD[T]HHmmss';
    dates = event.start.format(fmt) + '/' + event.end.format(fmt);
  } else {
    fmt = 'YYYYMMDD';
    dates = event.start.format(fmt) + '/' + event.start.clone().add(1, 'day').format(fmt);
  }
  return URI('https://calendar.google.com/calendar/render')
    .addQuery({
      action: 'TEMPLATE',
      text: event.title,
      details: event.summary,
      dates: dates
    })
    .toString();
}

function getUrl(path, params) {
  return URI(window.API_LOCATION)
    .path(Array.prototype.concat(window.API_VERSION, path || [], '').join('/'))
    .addQuery({
      api_key: window.API_KEY,
      per_page: 500
    })
    .addQuery(params || {})
    .toString();
}

function CalendarTooltip(content, $container) {
  this.$content = $(content);
  this.$container = $container;
  this.$close = this.$content.find('.js-close');
  this.$dropdown = this.$content.find('.dropdown');
  this.exportDropdown = new dropdown.Dropdown(this.$dropdown, {checkboxes: false});

  this.events = new Listeners();
  this.events.on(this.$close, 'click', this.close.bind(this));
  this.events.on($(document.body), 'click', this.handleClickAway.bind(this));
}

CalendarTooltip.prototype.handleClickAway = function(e) {
  var $target = $(e.target);
  if (!this.$content.has($target).length && !this.$container.has($target).length) {
    this.close();
  }
};

CalendarTooltip.prototype.close = function() {
  this.$content.remove();
  this.exportDropdown.destroy();
  this.$container.find('.fc-content').focus();
  this.events.off();
};

module.exports = {
  Calendar: Calendar,
  getUrl: getUrl
};
