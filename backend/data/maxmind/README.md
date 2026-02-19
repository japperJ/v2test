# MaxMind GeoIP Databases

This directory contains MaxMind GeoIP2/GeoLite2 database files used for:
- IP geolocation (city, country, lat/lng)
- VPN/Proxy detection

## Required Files

| File | Description | License |
|---|---|---|
| `GeoLite2-City.mmdb` | IP to city/country/lat-lng mapping | Free (MaxMind license) |
| `GeoIP2-Anonymous-IP.mmdb` | VPN/proxy/Tor detection | Paid or free trial |

## Download Instructions

1. **Create a MaxMind account** at https://www.maxmind.com/en/geolite2/signup

2. **Download GeoLite2-City** (free):
   - Log in to MaxMind account
   - Navigate to: Account > Downloads
   - Download: GeoLite2 City (binary .mmdb format)
   - Extract and place `GeoLite2-City.mmdb` in this directory

3. **Download GeoIP2-Anonymous-IP**:
   - Free trial available or paid subscription required
   - Navigate to: Account > Downloads  
   - Download: GeoIP2 Anonymous IP (binary .mmdb format)
   - Extract and place `GeoIP2-Anonymous-IP.mmdb` in this directory

4. **Configure `.env`**:
   ```
   MAXMIND_CITY_DB_PATH=./data/maxmind/GeoLite2-City.mmdb
   MAXMIND_ANONYMOUSIP_DB_PATH=./data/maxmind/GeoIP2-Anonymous-IP.mmdb
   ```

## Automatic Updates

MaxMind releases database updates on the first Tuesday of each month.
Consider setting up automatic download via the [GeoIP Update](https://github.com/maxmind/geoipupdate) tool.

## Notes

- These files are **NOT committed to git** (see .gitignore)
- The backend health check will warn if these files are not found
- Without the Anonymous IP DB, VPN detection will be disabled
