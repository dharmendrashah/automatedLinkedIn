import { TaskError } from './errors'

// Which hosts spider may visit. Anything else is refused before a browser opens it.
export class HostPolicy {
   private constructor(
      private readonly allowedHosts: string[],
      private readonly robotsExemptHosts: string[]
   ) {}

   private static parse(list: string) {
      return list
         .split(',')
         .map(host => host.trim().toLowerCase())
         .filter(Boolean)
   }

   public static fromList(list: string, robotsExemptList = '') {
      const hosts = HostPolicy.parse(list)
      const exempt = HostPolicy.parse(robotsExemptList)

      if (hosts.length === 0) {
         throw new Error('SPIDER_ALLOWED_HOSTS needs at least one host')
      }

      const policy = new HostPolicy(hosts, exempt)
      const stray = exempt.find(host => !policy.allowsHost(host))

      if (stray) {
         throw new Error(`SPIDER_ROBOTS_EXEMPT_HOSTS lists ${stray}, which is not in SPIDER_ALLOWED_HOSTS`)
      }

      return policy
   }

   public allowsHost(host: string) {
      const name = host.toLowerCase()

      return this.allowedHosts.some(allowed => name === allowed || name.endsWith(`.${allowed}`))
   }

   // Hosts the operator decided not to check robots.txt for. Everything else about them is still enforced.
   public exemptsRobots(host: string) {
      const name = host.toLowerCase()

      return this.robotsExemptHosts.some(exempt => name === exempt || name.endsWith(`.${exempt}`))
   }

   // Cookies may only be applied to hosts spider is allowed to visit.
   public allowsCookieDomain(domain: string) {
      const name = domain.replace(/^\./, '')

      return name !== '' && this.allowsHost(name)
   }

   public allowsUrl(raw: string) {
      try {
         this.assertAllowedUrl(raw)

         return true
      } catch {
         return false
      }
   }

   public assertAllowedUrl(raw: string) {
      let url: URL

      try {
         url = new URL(raw)
      } catch {
         throw new TaskError('The url is not valid')
      }

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
         throw new TaskError('Only http and https urls are allowed')
      }

      if (url.username || url.password) {
         throw new TaskError('Urls with credentials are not allowed')
      }

      if (!this.allowsHost(url.hostname)) {
         throw new TaskError(`The host ${url.hostname} is not allowed`)
      }

      return url
   }
}
