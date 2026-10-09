import { cleanEnv, port, str as string, url } from 'envalid'

export class Environment {
   public static config() {
      return cleanEnv(process.env, {
         PORT: port({
            desc: 'Port the Express server is running on',
            example: '3001',
            default: 3001,
            docs: 'https://expressjs.com/en/starter/hello-world.html',
         }),
         NODE_ENV: string({
            desc: 'The mode the Express is running in',
            example: 'development',
            choices: ['development', 'test', 'production'] as const,
            default: 'development',
            docs: 'https://nodejs.dev/en/learn/how-to-read-environment-variables-from-nodejs/',
         }),
         DATABASE_URL: url({
            desc: 'PostgreSQL connection string used by Prisma',
            example: 'postgresql://postgres:postgres@localhost:5432/automatedlinkedin',
            docs: 'https://www.prisma.io/docs/orm/reference/connection-urls',
         }),
      })
   }
}
