import { basename, extname } from 'path'
import {
    existsSync,
    mkdirSync,
    writeFileSync,
    readFileSync,
    readdirSync,
    statSync
} from 'fs'

let path = process.argv[2]

if (path && path !== "") {
    if (statSync(path).isDirectory()) {
        let filenames = readdirSync(path)
        filenames.forEach(filename => {
            let fileData = readFileSync(`${path}/${filename}`).toString()
            localSave(filename, jsonToIcs(JSON.parse(fileData)))
        })
    } else {
        let fileData = readFileSync(path).toString()
        localSave(path, jsonToIcs(JSON.parse(fileData)))
    }
}

function jsonToIcs(events: any[]) {
    let beginCalendar = 'BEGIN:VCALENDAR\n' +
        'VERSION:2.0\n' +
        'PRODID:-//Apple Inc.//Mac OS X 10.15.7//EN\n' +
        'CALSCALE:GREGORIAN\n'
    let endCalendar = "END:VCALENDAR"
    let eventsCalendarStr = ""

    for (let event of events) {
        eventsCalendarStr += "BEGIN:VEVENT\n" +
            `UID:${event.uid}\n`

        event.dtstamp
            ? eventsCalendarStr += `DTSTAMP:${formatDateForIcs(event.dtstamp)}\n`
            : eventsCalendarStr += `DTSTAMP: \n`

        event.start
            ? eventsCalendarStr += `DTSTART:${formatDateForIcs(event.start)}\n`
            : eventsCalendarStr += `DTSTART: \n`

        event.end
            ? eventsCalendarStr += `DTEND:${formatDateForIcs(event.end)}\n`
            : eventsCalendarStr += `DTEND: \n`

        event.created
            ? eventsCalendarStr += `CREATED:${formatDateForIcs(event.created)}\n`
            : eventsCalendarStr += `CREATED: \n`

        event.lastmodified
            ? eventsCalendarStr += `LAST-MODIFIED:${formatDateForIcs(event.lastmodified)}\n`
            : eventsCalendarStr += `LAST-MODIFIED: \n`

        event.location
            ? eventsCalendarStr += `LOCATION:${event.location}\n`
            : eventsCalendarStr += `LOCATION: \n`

        event.summary
            ? eventsCalendarStr += `SUMMARY:${event.summary}\n`
            : eventsCalendarStr += `SUMMARY: \n`

        event.description
            ? eventsCalendarStr += `DESCRIPTION:${event.description}\n`
            : eventsCalendarStr += `DESCRIPTION: \n`

        eventsCalendarStr += "END:VEVENT\n";
    }
    return beginCalendar + eventsCalendarStr + endCalendar;
}

function formatDateForIcs(date: string) {
    function padDate(n: number) {
        return (n < 10) ? '0' + n : '' + n
    }
    let d = new Date(date);
    return d.getUTCFullYear() +
        padDate(d.getUTCMonth() + 1) +
        padDate(d.getUTCDate()) + 
        'T' +
        padDate(d.getUTCHours()) + 
        padDate(d.getUTCMinutes()) + 
        '00Z';
}

function localSave(path: string, str: string) {
    if (!existsSync("./edts-ics")) {
        mkdirSync("./edts-ics")
    }
    let filename = basename(path)
    filename = filename.substring(0, filename.indexOf(extname(filename)))
    writeFileSync(`./edts-ics/${filename}.ics`, str)
}
