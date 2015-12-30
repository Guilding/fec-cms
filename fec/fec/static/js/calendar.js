'use strict';

var $ = require('jquery');
var URI = require('urijs');
var dropdown = require('fec-style/js/dropdowns');

require('fullcalendar');

var templates = {
  details: require('../hbs/calendar/details.hbs'),
  download: require('../hbs/calendar/download.hbs'),
  subscribe: require('../hbs/calendar/subscribe.hbs')
};

function Calendar(opts) {
  this.opts = $.extend({}, Calendar.defaultOpts, opts);

  this.$calendar = $(this.opts.selector).fullCalendar(this.opts.calendarOpts);
  this.url = URI(this.opts.url);
  this.exportUrl = URI(this.opts.exportUrl);
  this.sources = null;
  this.filterPanel = this.opts.filterPanel;

  this.$download = $(opts.download);
  this.$subscribe = $(opts.subscribe);

  this.$calendar.on('calendar:rendered', this.filterPanel.setHeight());

  this.filter();
  this.styleButtons();
  this.filterPanel.setHeight();
}

Calendar.defaultOpts = {
  calendarOpts: {
    header: {
      left: 'prev,next today',
      center: 'title',
      right: 'month,agendaWeek,agendaDay'
    },
    buttonIcons: false,
    buttonText: {
      today: 'Today',
      month: 'Month',
      week: 'Week',
      day: 'Day'
    },
    eventAfterAllRender: handleRender,
    eventClick: handleEventClick,
    eventLimit: true,
    views: {
      month: {
        eventLimit: 3
      }
    }
  },
  sourceOpts: {}
};

function handleRender(view) {
  $(document.body).trigger($.Event('calendar:rendered'));
}

function handleEventClick(calEvent, jsEvent, view) {
  var $eventContainer = $(jsEvent.target).closest('.fc-event-container');
  var tooltip = new CalendarTooltip(calEvent);
  $eventContainer.append(tooltip.$content);
}

Calendar.prototype.filter = function(params) {
  var url = this.url.clone().addQuery(params || {}).toString();
  this.$calendar.fullCalendar('removeEventSource', this.sources);
  this.sources = $.extend({}, this.opts.sourceOpts, {url: url});
  this.$calendar.fullCalendar('addEventSource', this.sources);
  this.updateLinks(params);
};

Calendar.prototype.updateLinks = function(params) {
  var url = this.exportUrl.clone().addQuery(params || {});
  var urls = {
    ics: url.toString(),
    csv: url.query({renderer: 'csv'}).toString(),
    google: 'https://calendar.google.com/calendar/render?cid=' + url.toString(),
    calendar: url.protocol('webcal').toString()
  };
  this.$download.html(templates.download(urls));
  this.$subscribe.html(templates.subscribe(urls));

  new dropdown.Dropdown(this.$download, {checkboxes: false});
  new dropdown.Dropdown(this.$subscribe, {checkboxes: false});
};

Calendar.prototype.styleButtons = function() {
  var baseClasses = 'button button--neutral';
  this.$calendar.find('.fc-button').addClass(baseClasses);
  this.$calendar.find('.fc-next-button').addClass('button--next');
  this.$calendar.find('.fc-prev-button').addClass('button--previous');
  this.$calendar.find('.fc-right .fc-button-group').addClass('toggles--buttons');
};

var classMap = {
  election: 'fc--election',
  report: 'fc--deadline',
  open: 'fc--meeting',
  executive: 'fc--executive',
  roundtables: 'fc--outreach',
  conferences: 'fc--outreach',
  litigation: 'fc--other',
  fea: 'fc--other'
};

function setClass(event) {
  var className = '';
  var category = event.category ? event.category.split(/[ -]+/)[0] : null;

  className += event.end_Date !== null ? ' fc--allday' : '';
  className += category ? ' ' + classMap[category.toLowerCase()] : '';
  return className;
}

function success(response) {
  return response.results.map(function(event) {
    return {
      title: event.description,
      summary: event.summary,
      start: event.start_date,
      end: event.end_date,
      allDay: event.end_date !== null,
      className: setClass(event)
    };
  });
}

var fecSources = {
  startParam: 'min_start_date_time',
  endParam: 'max_start_date_time',
  success: success
};

function getUrl(path, params) {
  return URI(window.API_LOCATION)
    .path([window.API_VERSION].concat(path || []).join('/'))
    .addQuery({api_key: window.API_KEY})
    .addQuery(params || {})
    .toString();
}

function CalendarTooltip(calEvent) {
  this.$content = $(templates.details(calEvent));
  this.$close = this.$content.find('.js-close');
  this.$content.on('click', this.$close, this.close.bind(this));
};

CalendarTooltip.prototype.close = function() {
  this.$content.remove();
};

module.exports = {
  Calendar: Calendar,
  fecSources: fecSources,
  getUrl: getUrl
};
