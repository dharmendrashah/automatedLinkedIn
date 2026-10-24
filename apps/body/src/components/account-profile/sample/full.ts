import type { AccountProfile } from '@automatedLinkedIn/contracts'

const HOUR_MS = 60 * 60 * 1000

// An invented profile with every section filled, to look at the page before the real one can be read. No real person, company or
// text is in it, and no picture: the page falls back to initials and a plain cover.
export const fullProfile = (now: Date): AccountProfile => ({
   contract: 1,
   captured_at: new Date(now.getTime() - 3 * HOUR_MS).toISOString(),
   profileUrl: 'https://www.linkedin.com/in/sample-person/',
   name: 'Sample Person',
   verified: true,
   pronouns: 'They/Them',
   headline: 'Leading product teams that ship less and matter more.',
   location: 'Sampletown, Exampleland',
   followers: 905,
   connections: '500+',
   openToWork: {
      titles: ['Head of Product', 'Product Lead', 'Group Product Manager'],
      audience: 'Recruiters only',
   },
   about: 'Product leader with seven years of experience guiding cross-functional teams from first idea to launch. I like clear goals, small steps and honest numbers.\n\nI have run discovery, planning and delivery for B2B software, set up the habits that keep teams aligned, and coached people into their first lead roles. Outside work I write about how teams decide what not to build.',
   topSkills: ['Product Strategy', 'Team Leadership'],
   services: ['Product Discovery', 'Roadmapping', 'Team Coaching', 'Workshop Facilitation', 'Metrics Design'],
   analytics: {
      profileViews: 39,
      postImpressions: 1,
      searchAppearances: 18,
      period: 'Past 7 days',
   },
   activity: {
      followers: 905,
      posts: [
         {
            kind: 'REPOST',
            author: 'Example Labs',
            authorHeadline: '4,210 followers',
            when: 'Aug 3',
            text: 'We are proud to share what our teams built this year: three launches, one new office and a lot of coffee. Read the story behind each launch and what we learned on the way.',
            reactions: 24,
            comments: 1,
            reposts: 13,
         },
         {
            kind: 'POST',
            author: 'Sample Person',
            authorHeadline: 'Leading product teams that ship less and matter more.',
            when: 'Jun 2',
            text: 'Recently started using a new tool for checking lists before a campaign.\n\nThe experience has been smooth so far: fast checks, a clean interface, and fewer bounces before anything goes live.\n\nFor anyone running outreach, a reliable check is worth the few minutes it takes.',
            reactions: 4,
            comments: 1,
            impressions: 499,
         },
         {
            kind: 'POST',
            author: 'Sample Person',
            authorHeadline: 'Leading product teams that ship less and matter more.',
            when: 'Apr 18',
            text: 'Three questions I ask before adding anything to a roadmap: who asked, what changes for them, and how will we know.',
            reactions: 31,
            comments: 6,
            reposts: 2,
            impressions: 2310,
         },
      ],
      comments: [
         {
            kind: 'POST',
            author: 'Sample Person',
            when: 'May 9',
            text: 'Well said. We stopped counting features and started counting decisions, and the planning meetings got shorter.',
            reactions: 3,
         },
      ],
   },
   experience: [
      {
         title: 'Head of Product',
         company: 'Example Labs',
         employmentType: 'Full-time',
         dates: 'Mar 2025 - Present',
         duration: '1 yr 8 mos',
         description: 'Owning the roadmap and making sure the team delivers what it promised.',
         skills: ['Product Strategy', 'Leadership'],
      },
      {
         title: 'Senior Product Manager',
         company: 'Sampleworks',
         employmentType: 'Full-time',
         dates: 'Mar 2022 - Mar 2025',
         duration: '3 yrs 1 mo',
         location: 'Sampletown, Exampleland',
         workMode: 'On-site',
         description: 'Ran discovery and delivery for the customer platform and coached two new product managers.',
         skills: ['Roadmapping', 'Customer Research', 'Agile Delivery', 'Stakeholder Management'],
      },
      {
         title: 'Co-founder',
         company: 'Demo Studio',
         employmentType: 'Part-time',
         dates: 'Mar 2024 - Jan 2025',
         duration: '11 mos',
         location: 'Sampletown, Exampleland',
         workMode: 'Hybrid',
         description: 'Built a small tool that saves people hours of copying data between systems.',
         skills: [],
      },
      {
         title: 'Product Analyst',
         company: 'Placeholder Systems',
         employmentType: 'Full-time',
         dates: 'Mar 2020 - Jul 2022',
         duration: '2 yrs 5 mos',
         location: 'Metropolis, Exampleland',
         workMode: 'Remote',
         description: 'Built the first dashboards the team used to decide what to build next.',
         skills: ['SQL', 'Analytics'],
      },
   ],
   education: [
      {
         school: 'Example Central School',
         degree: 'Accountancy',
         dates: '2014 – 2018',
      },
   ],
   projects: {
      total: 5,
      items: [
         {
            name: 'Roadmap Kit',
            dates: 'May 2022 – Present',
            description:
               'A set of templates for planning quarters. I wrote most of them and keep them up to date with what teams tell me.',
            skills: ['Planning', 'Templates', '+7 skills'],
            associatedWith: 'Associated with Sampleworks',
         },
         {
            name: 'decision-log',
            dates: 'Aug 2023 – Aug 2023',
            description:
               'A tiny command line tool that keeps a log of product decisions with the reason beside each. It writes plain files and has no dependencies, so any team can adopt it without asking anyone.',
            skills: ['Open source'],
         },
      ],
   },
   skills: {
      total: 56,
      items: [{ name: 'Product Management' }, { name: 'Team Leadership' }, { name: 'Roadmapping' }],
   },
   recommendations: {
      pending: 1,
      received: {
         total: 2,
         items: [
            {
               name: 'Robin Example',
               degree: '1st',
               headline: 'Founder & CEO at Example Labs',
               relationship: 'August 27, 2024, Robin was senior to Sample but did not manage them directly',
               text: 'I had the privilege of working with Sample for three years. They played a central role in our most ambitious project and kept every team pointed at the same goal.\n\nThey are calm under pressure, clear in writing and generous with their time. I would work with them again without hesitation.',
            },
            {
               name: 'Jordan Placeholder',
               degree: '1st',
               headline: 'Design Lead at Placeholder Systems',
               relationship: 'December 4, 2022, Jordan worked with Sample but on different teams',
               text: 'Very pleased to recommend Sample. Not only a key player on our team, but also a good friend. Their skills and manner would make them a valuable addition to any product team.',
            },
         ],
      },
      given: {
         total: 1,
         items: [
            {
               name: 'Casey Demo',
               degree: '2nd',
               headline: 'Engineer at Sampleworks',
               relationship: 'March 12, 2023, Sample managed Casey directly',
               text: 'Casey turns vague problems into small, shippable steps. Every team needs someone who does that.',
            },
         ],
      },
   },
   languages: {
      total: 2,
      items: [
         {
            name: 'English',
            proficiency: 'Professional working proficiency',
         },
         {
            name: 'Hindi',
            proficiency: 'Native or bilingual proficiency',
         },
      ],
   },
   interests: {
      topVoices: [
         {
            name: 'Avery Voice',
            subtitle: 'Cofounder & Editor at Example Press',
            degree: '2nd',
            followers: '954,799 followers',
         },
         {
            name: 'Morgan Leader',
            subtitle: 'Chair and CEO at Demo Corp',
            degree: '3rd',
            followers: '12,248,563 followers',
         },
      ],
      companies: [
         {
            name: 'Demo Corp',
            followers: '24,100,000 followers',
         },
         {
            name: 'Example Press',
            followers: '310,200 followers',
         },
      ],
      groups: [
         {
            name: 'Product Leaders Circle',
            followers: '18,400 members',
         },
      ],
      newsletters: [
         {
            name: 'The Weekly Roadmap',
            subtitle: 'Weekly',
            followers: '52,300 subscribers',
         },
      ],
      schools: [
         {
            name: 'Example Central School',
            followers: '9,800 followers',
         },
      ],
   },
   peopleYouMayKnow: [
      {
         name: 'Riley Sample',
         subtitle: 'Product Manager at Demo Corp',
         degree: '2nd',
      },
      {
         name: 'Taylor Example',
         subtitle: 'Engineering Manager at Sampleworks',
         degree: '2nd',
      },
      {
         name: 'Sam Placeholder',
         subtitle: 'Designer at Example Labs',
         degree: '3rd',
      },
      {
         name: 'Drew Demo',
         subtitle: 'Analyst at Placeholder Systems',
         degree: '2nd',
      },
   ],
   youMightLike: [
      {
         name: 'Product Craft',
         subtitle: 'Newsletter',
         followers: '88,100 followers',
      },
      {
         name: 'Studio Example',
         subtitle: 'Design services',
         followers: '14,300 followers',
      },
      {
         name: 'Demo Labs',
         subtitle: 'Software development',
         followers: '2,900 followers',
      },
   ],
})
