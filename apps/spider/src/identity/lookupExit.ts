import { getGeolocation } from 'camoufox/dist/geolocation.js'
import { ProxyHelper, proxyExitGeo, publicIP } from 'camoufox/dist/ip.js'
import { getUnicodeInfo, normalizeLocale } from 'camoufox/dist/locales.js'

import { type ProxyConfig } from '../types'

import { type ExitRegion } from './region'

// The language most people speak in a country, as a locale. Camoufox's own geoip draws a language at random from each
// country's shares (a US address gets Spanish about one time in ten, and now and then German), and LinkedIn shows its
// pages in that language. A person's account keeps one plausible language, so the main one is taken instead, the same on
// every run. Without data for the country the drawn one stays.
const mainLocale = async (country: string, drawn: string) => {
   const territory = (await getUnicodeInfo()).find(({ $ }) => $.type === country)
   const [main] = [...(territory?.languagePopulation ?? [])].sort(
      (a, b) => Number(b.$.populationPercent) - Number(a.$.populationPercent)
   )

   if (!main?.$.type) {
      return drawn
   }

   try {
      return normalizeLocale(`${main.$.type.replaceAll('_', '-')}-${country}`).asString
   } catch {
      return drawn
   }
}

// The address a proxy's traffic leaves from, asked fresh through the proxy every time (Camoufox's own cached lookup would
// keep the first answer of a rotating proxy for the life of the worker), and the country, language and timezone that
// address stands for. Camoufox makes the same lookup when it starts with `geoip`; doing it first lets the answer be
// compared with what the account had and handed to the browser. Without a proxy it is this machine's address.
export const lookupExit = async (proxy?: ProxyConfig): Promise<ExitRegion> => {
   const [ip] = proxy ? await proxyExitGeo(ProxyHelper.asString(proxy)) : [await publicIP()]
   const { locale, timezone } = await getGeolocation(ip)
   const country = locale.region ?? ''

   return {
      ip,
      country,
      locale: country ? await mainLocale(country, locale.asString) : locale.asString,
      timezone,
   }
}
