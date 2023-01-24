import { JSDOM } from 'jsdom'
import { chromium } from 'playwright'
import ical from 'node-ical'
import http from 'http'
import { writeFile, readFileSync } from 'fs'
import { addDays, addWeeks, isBefore } from 'date-fns'

async function run() {
    const browser = await chromium.launch({
        headless: true,
    })

    const page = await browser.newPage()
    console.log("loading page")
    await page.goto('https://cal.ufr-info-p6.jussieu.fr/master/')
    page.setDefaultTimeout(350000)

    let response = await page.waitForResponse((res) =>
        res.url().includes('https://cal.ufr-info-p6.jussieu.fr/caldav.php/')
    )
    let resStr = (await response.body()).toString()

    let links = getSettingsLinks(resStr)
    links = links.map((link) => {
        let tempURL = new URL(link)
        tempURL.port = ''
        return tempURL.toString()
    })
    links = [...new Set(links)]
    let allEvents: any = {}

    page.on('response', (response) => {
        let url = response.url()
        if (links.includes(url)) {
            response.body().then((resBody) => {
                let name = url.replace('https://cal.ufr-info-p6.jussieu.fr/caldav.php/', '')

                if (name.charAt(name.length - 1) == '/') {
                    name = name.substring(0, name.length - 1)
                }
                let results = readResult(resBody.toString())
                if (!allEvents[name] || allEvents[name].length === 0) {
                    allEvents[name] = results
                }
            })
        }
    })

    await page.waitForSelector('#MainLoader', { state: 'hidden' })
    await browser.close()

    for (let key of Object.keys(allEvents)) {
        let splitKey = key.split('/')
        let filename = splitKey[1].replace(/\//g, '_')
        writeFile(`./edts/${filename}.json`, JSON.stringify(allEvents[key]), () => {
            console.log(`file written:  ./edts/${filename}.json`);
        })
    }
}

function getSettingsLinks(file: string): string[] {
    let xml = new JSDOM(file).window.document
    let settings = xml.getElementsByTagName('I:settings')[0]
    let settingsJson = JSON.parse(settings.innerHTML)
    return settingsJson.loadedtodocollections
}

function readResult(file: string) {
    let xml = new JSDOM(file).window.document
    let icsData = xml.getElementsByTagName('C:calendar-data')
    if (icsData.length > 0) {
        let events = []
        for (let i = 0; i < icsData.length; i++) {
            let icsEvents = ical.sync.parseICS(icsData[i].innerHTML)
            for (let event of Object.values(icsEvents)) {
                if (event.type === 'VEVENT') {
                    events.push(event)
                }
            }
        }
        events = processEvents(events)
        return events
    }
    return []
}

function processEvents(events: any[]) {
    let recurrences: any = {}

    function existingRecurrence(event: any) {
        if (recurrences[event.origUid]) {
            for (let rec of recurrences[event.origUid]) {
                if (rec.origUid === event.origUid && rec.start.getTime() === event.start.getTime()) {
                    return true
                }
            }
        }
        if (event.recurrences) {
            for (let rec of Object.values(event.origUid)) {
                // @ts-ignore
                if (rec.origUid === event.origUid && rec.start.getTime() === event.start.getTime()) {
                    return true
                }
            }
        }
        return false
    }

    for (let e of events) {
        if (e.summary === "MU4IN505-CPA-TME") {
            console.log(e)
        }
        if (e.recurrences) {
            let i = 1
            for (let recurrence of Object.values(e.recurrences)) {
                // @ts-ignore
                recurrence.uid = 'r' + (i++) + '-' + recurrence.uid
                // @ts-ignore
                recurrence.origUid = e.uid
                events.push(recurrence)
                if (!recurrences[e.uid]) {
                    recurrences[e.uid] = []
                }
                recurrences[e.uid].push(recurrence)
                // @ts-ignore
                if (e.start.getTime() === recurrence.start.getTime() && e.end.getTime() === recurrence.end.getTime()) {
                    events.splice(events.indexOf(e), 1)
                }
            }
            delete e.recurrences
        }
    }
    for (let e of events) {
        if (e.rrule) {
            let options = e.rrule.origOptions
            let untilDate = new Date(options.until)
            let eStart = new Date(e.start)
            let eEnd = new Date(e.end)
            if (options.freq === 2) {
                eStart = addWeeks(eStart, options.interval)
                eEnd = addWeeks(eEnd, options.interval)
            } else {
                eStart = addDays(eStart, options.interval)
                eEnd = addDays(eEnd, options.interval)
            }
            let i = 1
            while (isBefore(eStart, untilDate)) {
                let event = { ...e }
                event.start = new Date(eStart.toISOString())
                event.end = new Date(eEnd.toISOString())
                event.uid = 'rr' + (i++) + '-' + event.uid
                event.origUid = e.uid
                delete event.rrule
                if (event.start !== e.start && event.end !== e.end && !existingRecurrence(event)) {
                    if (e.exdate) {
                        let isExDate = false
                        for (let exdate of Object.values(e.exdate)) {
                            // @ts-ignore
                            let date = new Date(exdate)
                            if (event.start.toISOString() === date.toISOString()) {
                                isExDate = true
                                break;
                            }
                        }
                        if (!isExDate) {
                            events.push(event)
                        }
                    } else {
                        events.push(event)
                    }
                }
                if (options.freq === 2) {
                    eStart = addWeeks(eStart, options.interval)
                    eEnd = addWeeks(eEnd, options.interval)
                } else {
                    eStart = addDays(eStart, options.interval)
                    eEnd = addDays(eEnd, options.interval)
                }
            }

            delete e.rrule
        }
    }
    return events
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

        if (event.dtstamp) {
            eventsCalendarStr += `DTSTAMP:${formatDateForIcs(event.dtstamp)}\n`
        }
        if (event.start) {
            eventsCalendarStr += `DTSTART:${formatDateForIcs(event.start)}\n`
        }
        if (event.end) {
            eventsCalendarStr += `DTEND:${formatDateForIcs(event.end)}\n`
        }
        if (event.created) {
            eventsCalendarStr += `CREATED:${formatDateForIcs(event.created)}\n`
        }
        if (event.lastmodified) {
            eventsCalendarStr += `LAST-MODIFIED:${formatDateForIcs(event.lastmodified)}\n`
        }
        if (event.location) {
            eventsCalendarStr += `LOCATION:${event.location}\n`
        }
        if (event.summary) {
            eventsCalendarStr += `SUMMARY:${event.summary}\n`
        }
        if (event.description) {
            eventsCalendarStr += `DESCRIPTION:${event.description}\n`
        }

        eventsCalendarStr += "END:VEVENT\n";
    }
    return beginCalendar + eventsCalendarStr + endCalendar;
}

function formatDateForIcs(date: string) {
    let d = new Date(date);
    return `${d.getUTCFullYear()}${padDate(d.getUTCMonth() + 1)}${padDate(d.getUTCDate())}T` +
        `${padDate(d.getUTCHours())}${padDate(d.getUTCMinutes())}00Z`;
}

function padDate(n: number) {
    return (n < 10) ? '0' + n : '' + n
}

const server = http.createServer((req, res) => {
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/calendar; charset=uft-8');
    let url = new URL(req.url ?? '', `http://${req.headers.host}`)
    let path = url.pathname.toUpperCase()
    console.log(path);
    if (path.charAt(0) == "/") {
        path = path.slice(1, path.length)
        console.log(path);

    }
    let files = path.split('&')
    let allEvents: any[] = []
    for (let filename of files) {
        try {
            let events = JSON.parse(readFileSync(`./edts/${filename}.json`).toString())
            allEvents = [...allEvents, ...events]
        } catch (e) {
            console.log("error reading file: " + filename);
        }
    }
    res.end(jsonToIcs(allEvents))
});

run()
server.listen(8080)
