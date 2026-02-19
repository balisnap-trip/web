/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_BASE_URL,
  generateRobotsTxt: true,
  robotsTxtOptions: {
    policies: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'] // Mencegah crawler mengindeks rute API
      }
    ]
  },
  sitemapSize: 7000,
  exclude: ['/api/*'],
  additionalPaths: async (config) => {
    const result = []

    result.push({ loc: '/', changefreq: 'monthly', priority: 1.0 }) // Halaman Home
    result.push({ loc: '/about', changefreq: 'monthly', priority: 0.7 })
    result.push({ loc: '/tours', changefreq: 'monthly', priority: 0.7 })
    result.push({ loc: '/contact', changefreq: 'monthly', priority: 0.7 })
    result.push({
      loc: '/privacy-policy',
      changefreq: 'monthly',
      priority: 0.7
    })
    result.push({
      loc: '/terms-of-service',
      changefreq: 'monthly',
      priority: 0.7
    })
    // Fetch tours from the API
    const fetchTours = async () => {
      const apiUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/tours`
      try {
        const res = await fetch(apiUrl, {
          cache: 'no-cache'
        })

        if (!res.ok) {
          throw new Error('Network response was not ok')
        }

        const data = await res.json()
        console.log(data)
        return data
      } catch (error) {
        return [] // Return empty array on error
      }
    }

    const tours = await fetchTours()

    for (const tour of tours) {
      result.push({
        loc: `/tours/${tour.slug}`, // URL dinamis berdasarkan data API
        changefreq: 'monthly',
        priority: 0.8
      })
    }

    return result
  }
}
