module("luci.controller.bandwidthbydevice", package.seeall)

function index()
    local page = entry({"admin", "status", "bandwidthbydevice"},
        alias("admin", "status", "bandwidthbydevice", "overview"),
        _("Bandwidth by Device"), 60)
    page.dependent = true

    entry({"admin", "status", "bandwidthbydevice", "overview"},
        template("bandwidthbydevice/overview"), _("Overview"), 1)

    entry({"admin", "status", "bandwidthbydevice", "device"},
        template("bandwidthbydevice/device"), _("Device Detail"), 2)

    -- JSON API endpoints
    entry({"admin", "status", "bandwidthbydevice", "api", "devices"},
        call("api_devices")).leaf = true

    entry({"admin", "status", "bandwidthbydevice", "api", "stats"},
        call("api_stats")).leaf = true

    entry({"admin", "status", "bandwidthbydevice", "api", "history"},
        call("api_history")).leaf = true
end

-- Returns list of all known devices with current bandwidth rates
function api_devices()
    luci.http.prepare_content("application/json")
    local data = read_json("/tmp/bandwidthbydevice/current.json")
    luci.http.write(data or "{\"devices\":[]}")
end

-- Returns recent sample history for a specific device (last N minutes)
function api_stats()
    local mac = luci.http.formvalue("mac")
    if not mac or not mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
        luci.http.status(400, "Bad Request")
        luci.http.write("{\"error\":\"invalid mac\"}")
        return
    end
    luci.http.prepare_content("application/json")
    local path = "/tmp/bandwidthbydevice/stats_" .. mac:gsub(":", "") .. ".json"
    local data = read_json(path)
    luci.http.write(data or "{\"samples\":[]}")
end

-- Returns long-term daily/weekly/monthly history for a device
function api_history()
    local mac = luci.http.formvalue("mac")
    if not mac or not mac:match("^%x%x:%x%x:%x%x:%x%x:%x%x:%x%x$") then
        luci.http.status(400, "Bad Request")
        luci.http.write("{\"error\":\"invalid mac\"}")
        return
    end
    luci.http.prepare_content("application/json")
    local path = "/etc/bandwidthbydevice/history_" .. mac:gsub(":", "") .. ".json"
    local data = read_json(path)
    luci.http.write(data or "{\"daily\":[]}")
end

function read_json(path)
    local f = io.open(path, "r")
    if not f then return nil end
    local content = f:read("*all")
    f:close()
    return content
end
