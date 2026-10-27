// The pages behind the profile's "Show all" links, by the address they have under the profile's own address. The names are the
// names of the kept files. Nothing here is clicked: each page is opened by its address, as a person could type it.
export const DETAIL_PAGES = [
   {
      name: 'experience',
      path: 'details/experience/',
   },
   {
      name: 'education',
      path: 'details/education/',
   },
   {
      name: 'projects',
      path: 'details/projects/',
   },
   {
      name: 'skills',
      path: 'details/skills/',
   },
   {
      name: 'recommendations-received',
      path: 'details/recommendations/',
   },
   {
      name: 'recommendations-given',
      path: 'details/recommendations/?detailScreenTabIndex=1',
   },
   {
      name: 'languages',
      path: 'details/languages/',
   },
   {
      name: 'interests',
      path: 'details/interests/',
   },
   {
      name: 'posts',
      path: 'recent-activity/all/',
   },
   {
      name: 'comments',
      path: 'recent-activity/comments/',
   },
   // The Contact info window of the profile's own address: phone, email, messengers, websites, birthday (the owner's, private).
   {
      name: 'contact',
      path: 'overlay/contact-info/',
   },
] as const
