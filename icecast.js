/*
 *  icecast directory plugin for Movian Media Center
 *
 *  Copyright (C) 2012-2018 Henrik Andersson, lprot
 *
 *  This program is free software: you can redistribute it and/or modify
 *  it under the terms of the GNU General Public License as published by
 *  the Free Software Foundation, either version 3 of the License, or
 *  (at your option) any later version.
 *
 *  This program is distributed in the hope that it will be useful,
 *  but WITHOUT ANY WARRANTY; without even the implied warranty of
 *  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 *  GNU General Public License for more details.
 *
 *  You should have received a copy of the GNU General Public License
 *  along with this program.  If not, see <http://www.gnu.org/licenses/>.
 */

var page = require('showtime/page');
var service = require('showtime/service');
var settings = require('showtime/settings');
var http = require('showtime/http');
var popup = require('native/popup');
var string = require('native/string');
var plugin = JSON.parse(Plugin.manifest);
var logo = Plugin.path + plugin.icon;

var BASE_URL = "http://dir.xiph.org";

 RichText = function(x) {
    this.str = x.toString();
}

RichText.prototype.toRichString = function(x) {
    return this.str;
}

function setPageHeader(page, title) {
    if (page.metadata) {
        page.metadata.title = title;
        page.metadata.logo = logo;
    }
    page.type = "directory";
    page.contents = "items";
    page.loading = false;
}

var blue = '6699CC', orange = 'FFA500', red = 'EE0000', green = '008B45';
function colorStr(str, color) {
    return '<font color="' + color + '"> (' + str + ')</font>';
}

function coloredStr(str, color) {
    return '<font color="' + color + '">' + str + '</font>';
}

var store = require('movian/store').create('favorites');
if (!store.list) 
    store.list = "[]";

service.create(plugin.title, plugin.id + ":start", 'music', true, logo);

settings.globalSettings(plugin.id, plugin.title, logo, plugin.synopsis);
settings.createAction("cleanFavorites", "Clean My Favorites", function () {
    store.list = "[]";
    popup.notify('My Favorites has been cleaned successfully', 2);
});

function trim(str) {
    if (!str) return '';
    return string.entityDecode(str).replace(/^\s+|\s+$/g,"");
}

new page.Route(plugin.id + ":video:(.*)", function(page, url) {
    page.type = 'video';
    page.source = unescape(url);
});

function addToMyFavorites(item) {
    item.addOptAction("Add '" + item.station + "' to My Favorites", function() {
        var entry = JSON.stringify({
            url: item.url,
            title: item.station,
            station: item.station,
            description: item.description,
            format: item.format,
            bitrate: this.bitrate
        });
        store.list = JSON.stringify([entry].concat(eval(store.list)));
        popup.notify("'" + this.station + "' has been added to My Favorites.", 2);
    });
}

function scrape_page(page, url, noReq, searcher) {
    page.entries = 0;
    var nextPage = '', tryToSearch = true;

    function loader() {
        var doc;
        if (!tryToSearch) return false;
        if (noReq)
            doc = url;
        else {
            page.loading = true;
            if (searcher && (page.entries > 0)) 
                doc = string.entityDecode(http.request(BASE_URL + '/search' + nextPage)).toString();
            else 
                doc = string.entityDecode(http.request(url + nextPage)).toString();
            page.loading = false;
        }
	var itemmd = {};
        var re = /<tr class="row([\S\s]*?)<\/tr>/g;
        var match = re.exec(doc);
	while (match) {
            var title = match[1].match(/<span class="name"><a href="[\S\s]*?;">([\S\s]*?)<\/a>/);
            if (title)
                itemmd.station = title[1];
            else
                itemmd.station = itemmd.title = match[1].match(/<span class="name">([\S\s]*?)<\/span>/)[1];
	        itemmd.listeners = match[1].match(/<span class="listeners">\[([\S\s]*?)\]<\/span>/)[1];
            var description = match[1].match(/<p class="stream-description">([\S\s]*?)<\/p>/);
            if (description) itemmd.description = description[1];
            var onair = match[1].match(/<p class="stream-onair"><strong>On Air:<\/strong>([\S\s]*?)<\/p>/);
            if (onair) itemmd.current_track = onair[1];
            itemmd.url = match[1].match(/<td class="tune-in">[\S\s]*?<a href="([\S\s]*?)"/)[1];
            itemmd.bitrate = match[1].match(/<p class="format" title="([\S\s]*?)">/)[1];
            itemmd.format = match[1].match(/<p class="format"[\S\s]*?class="no-link" title="[\S\s]*?">([\S\s]*?)<span/)[1];

	    var item = page.appendItem('icecast:' + BASE_URL + itemmd.url, "station", {
	        title: new RichText(itemmd.station + coloredStr(' ' + itemmd.format + ' ' + itemmd.bitrate, orange) +
                    ' ' + coloredStr(itemmd.listeners, green)),
                station: itemmd.station,
                icon: logo,
                onair: trim(itemmd.current_track),
		description: trim(itemmd.description),
		bitrate: itemmd.bitrate,
		format: itemmd.format,
                listeners: trim(itemmd.listeners)
	    });
	    item.url = "icecast:" + BASE_URL + itemmd.url;
	    item.title = itemmd.title;
	    item.station = itemmd.station;
	    item.description = itemmd.description;
	    item.bitrate = itemmd.bitrate;
	    item.format = itemmd.format;
            addToMyFavorites(item);
            page.entries++;
            match = re.exec(doc);
	}

        var next = doc.match(/<ul class="pager">([\S\s]*?)<\/ul>/);
        if (next)
            next = next[1].substr(next[1].lastIndexOf('<a href='));
        else
            return tryToSearch = false;
        next = next.match(/<a href="([\S\s]*?)">»<\/a>/);
        if (!next)
            return tryToSearch = false;
        nextPage = next[1];
        return true;
    }
    loader();
    page.paginator = loader;
    page.loading = false;
}

function removeItemFromMyFavorites(item, pos) {
    item.addOptAction("Remove '" + item.station + "' from My Favorites", function () {
        var list = eval(store.list);
        popup.notify("'" + item.station + "' has been removed from My Favorites.", 2);
        list.splice(pos, 1);
        store.list = JSON.stringify(list);
        page.flush();
        page.redirect(plugin.id + ':favorites');
    });
};

new page.Route(plugin.id + ":favorites", function(page) {
    setPageHeader(page, "My Favorites");
    var list = eval(store.list);

    if (!list || !list.toString()) {
        page.error("My Favorites list is empty");
        return;
    }

    var pos = 0;
    for (var i in list) {
	var itemmd = JSON.parse(list[i]);
        var item = page.appendItem(itemmd.url, "station", {
	    title: itemmd.station,
	    station: itemmd.station,
	    description: itemmd.description,
	    bitrate: itemmd.bitrate,
	    format: itemmd.format,
	    listeners: itemmd.listeners
	});
        removeItemFromMyFavorites(item, pos);        
        pos++;
    }
});

new page.Route(plugin.id + ":filter:(.*):(.*)", function(page, url, title) {
    setPageHeader(page, plugin.synopsis + " - " + title);
    scrape_page(page, BASE_URL + url);
});

new page.Route(plugin.id + ":genres", function(page) {
    setPageHeader(page, plugin.synopsis + " - Genres");
    page.loading = true;
    var resp = string.entityDecode(http.request(BASE_URL));
    page.loading = false;
    var genres = resp.match(/<div id="search-genre">([\S\s]*?)<\/ul>/);

    // 1-link, 2-title
    var re = /<span class="context">[\S\s]*?<\/span><a href="([\S\s]*?)"[\S\s]*?title="[\S\s]*?">([\S\s]*?)<\/a>/g;
    if (genres) {
        page.appendItem("", "separator", {
            title: "Genres"
        });
        var rec = re.exec(genres[1])
        while (rec) {
            page.appendItem(plugin.id + ":filter:" + rec[1] + ":" + rec[2], "directory", {
	        title: rec[2]
	    });
            rec = re.exec(genres[1]);
        };
    };
});

new page.Route(plugin.id + ":formats", function(page) {
    setPageHeader(page, plugin.synopsis + " - Formats");
    page.loading = true;
    var resp = string.entityDecode(http.request(BASE_URL));
    page.loading = false;
    var formats = resp.match(/<div id="search-format">([\S\s]*?)<\/ul>/);

    // 1-link, 2-title
    var re = /<li><a href="([\S\s]*?)">([\S\s]*?)<\/a>/g;
    if (formats) {
        page.appendItem("", "separator", {
            title: "Formats"
        });
        var rec = re.exec(formats[1])
        while (rec) {
            page.appendItem(plugin.id + ":filter:" + rec[1] + ":" + rec[2], "directory", {
	        title: rec[2]
	    });
            rec = re.exec(formats[1]);
        };
    };
});

new page.Route(plugin.id + ":start", function(page) {
    setPageHeader(page, plugin.synopsis);
    page.appendItem(plugin.id + ":search:", 'search', {
        title: 'Search at ' + BASE_URL
    });

    page.loading = true;
    var resp = string.entityDecode(http.request(BASE_URL));
    page.loading = false;

    var match = resp.match(/<div id="sidebar-statistics">[\S\s]*?<ul>([\S\s]*?)<\/ul>/);
    // 1-stream type, 2-counter
    var re = /<li>([\S\s]*?)<strong>([\S\s]*?)<\/strong>/g;
    var stat = '', pos = 0;
    if (match) {
        var rec = re.exec(match[1]);
        while (rec) {
            if (pos) 
                stat += ', ' + rec[1] + rec[2];
            else 
                stat += rec[1] + rec[2];
            pos++;
            rec = re.exec(match[1]);
        };
        page.appendItem("", "separator", {
            title: stat
        });
    }
    page.appendItem(plugin.id + ":genres", "directory", {
        title: "Genres"
    });
    page.appendItem(plugin.id + ":formats", "directory", {
	title: "Formats"
    });
    //page.appendItem(plugin.id + ":favorites", "directory", {
    //    title: "My Favorites"
    //});
    page.appendItem("", "separator", {
        title: "Random selection"
    });
    scrape_page(page, resp, 1);
});

new page.Route(plugin.id + ":search:(.*)", function(page, query) {
    setPageHeader(page, plugin.synopsis + ' - ' + query);
    scrape_page(page, BASE_URL + "/search?search=" + encodeURI(query), 0 , 1);
});

page.Searcher(plugin.title, logo, function(page, query) {
    setPageHeader(page, plugin.synopsis + ' - ' + query);
    scrape_page(page, BASE_URL + "/search?search=" + encodeURI(query), 0 , 1);
});
