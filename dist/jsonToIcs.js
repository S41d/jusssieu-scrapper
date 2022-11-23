import { basename, extname } from 'path';
import { existsSync, mkdirSync, writeFileSync, readFileSync, readdirSync, statSync } from 'fs';
let path = process.argv[2];
if (path && path !== "") {
    if (statSync(path).isDirectory()) {
        let filenames = readdirSync(path);
        filenames.forEach(filename => {
            let fileData = readFileSync(`${path}/${filename}`).toString();
            localSave(filename, jsonToIcs(JSON.parse(fileData)));
        });
    }
    else {
        let fileData = readFileSync(path).toString();
        localSave(path, jsonToIcs(JSON.parse(fileData)));
    }
}
function jsonToIcs(events) {
    let beginCalendar = 'BEGIN:VCALENDAR\n' +
        'VERSION:2.0\n' +
        'PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN\n' +
        'CALSCALE:GREGORIAN\n';
    let endCalendar = "END:VCALENDAR";
    let eventsCalendarStr = "";
    for (let event of events) {
        eventsCalendarStr += "BEGIN:VEVENT\n" +
            `UID:${event.uid}\n`;
        if (event.dtstamp) {
            eventsCalendarStr += `DTSTAMP:${formatDateForIcs(event.dtstamp)}\n`;
        }
        if (event.start) {
            eventsCalendarStr += `DTSTART:${formatDateForIcs(event.start)}\n`;
        }
        if (event.end) {
            eventsCalendarStr += `DTEND:${formatDateForIcs(event.end)}\n`;
        }
        if (event.created) {
            eventsCalendarStr += `CREATED:${formatDateForIcs(event.created)}\n`;
        }
        if (event.lastmodified) {
            eventsCalendarStr += `LAST-MODIFIED:${formatDateForIcs(event.lastmodified)}\n`;
        }
        if (event.location) {
            eventsCalendarStr += `LOCATION:${event.location}\n`;
        }
        if (event.summary) {
            eventsCalendarStr += `SUMMARY:${event.summary}\n`;
        }
        if (event.description) {
            eventsCalendarStr += `DESCRIPTION:${event.description}\n`;
        }
        eventsCalendarStr += "END:VEVENT\n";
    }
    return beginCalendar + eventsCalendarStr + endCalendar;
}
function formatDateForIcs(date) {
    function padDate(n) {
        return (n < 10) ? '0' + n : '' + n;
    }
    let d = new Date(date);
    return `${d.getUTCFullYear()}${padDate(d.getUTCMonth() + 1)}${padDate(d.getUTCDate())}T` +
        `${padDate(d.getUTCHours())}${padDate(d.getUTCMinutes())}00Z`;
}
function localSave(path, str) {
    if (!existsSync("./edts-ics")) {
        mkdirSync("./edts-ics");
    }
    let filename = basename(path);
    filename = filename.substring(0, filename.indexOf(extname(filename)));
    writeFileSync(`./edts-ics/${filename}.ics`, str);
}
