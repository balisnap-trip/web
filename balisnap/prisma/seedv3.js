const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Insert Activities for Sacred Moments
  const activitiesData = [
    {
      activity_name: 'Canang Sari Workshop',
      short_description:
        'Learn the art of making traditional Balinese offerings.',
      description:
        'Participate in a hands-on workshop where you will learn how to make Canang Sari, a traditional Balinese offering made from fresh flowers and leaves, used in daily rituals.',
      duration_hours: 1.5,
      base_price: 0,
      location: 'Ubud, Gianyar',
      thumbnail_url: '/activities/img/canang_sari_workshop.jpg'
    },
    {
      activity_name: 'Balinese Dance Class',
      short_description: 'Learn the basics of traditional Balinese dance.',
      description:
        'A guided class that teaches you the intricate movements and symbolism behind traditional Balinese dance, led by experienced instructors.',
      duration_hours: 2,
      base_price: 0,
      location: 'Ubud, Gianyar',
      thumbnail_url: '/activities/img/balinese_dance_class.jpg'
    },
    {
      activity_name: 'Art Museum Tour',
      short_description: 'Explore Bali&apos;s rich art history.',
      description:
        'Visit a renowned art museum in Ubud, such as the Agung Rai Museum of Art or Museum Puri Lukisan, and explore an extensive collection of classical and contemporary Balinese paintings, sculptures, and wood carvings.',
      duration_hours: 2,
      base_price: 0,
      location: 'Ubud, Gianyar',
      thumbnail_url: '/activities/img/art_museum.jpg'
    },
    {
      activity_name: 'Balinese Dance Performance',
      short_description: 'Enjoy an authentic Balinese dance performance.',
      description:
        'Witness a traditional Balinese dance performance, showcasing the graceful movements and stories that are central to Balinese cultural expression.',
      duration_hours: 1.5,
      base_price: 0,
      location: 'Ubud, Gianyar',
      thumbnail_url: '/activities/img/balinese_dance_performance.jpg'
    }
  ]

  // Insert Activities and store IDs
  await prisma.activity.createMany({
    data: activitiesData,
    skipDuplicates: true
  })

  // Fetch the inserted activities for later use
  const allActivities = await prisma.activity.findMany({
    where: {
      activity_name: { in: activitiesData.map((a) => a.activity_name) }
    }
  })

  const activityMap = allActivities.reduce((acc, activity) => {
    acc[activity.activity_name] = activity.activity_id
    return acc
  }, {})

  // Insert Tour Package with all related data
  const tourPackage = await prisma.tourPackage.create({
    data: {
      package_name: 'Sacred Moments: Cultural & Spiritual Immersion',
      slug: 'sacred-moments',
      short_description:
        'Immerse yourself in Bali&apos;s rich cultural and spiritual traditions.',
      description:
        'This 3-day journey delves deep into Bali&apos;s cultural and spiritual heritage. From learning to make traditional offerings to experiencing Balinese dance and visiting local artisans, this tour offers a rich, immersive experience.',
      duration_days: 3,
      price_per_person: 650,
      price_per_child: null,
      min_booking: 2,
      max_booking: null,
      is_featured: true,
      thumbnail_url: '/tours/img/sacred_moments/sm1.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      TourItineraries: {
        create: [
          {
            activity_id: activityMap['Canang Sari Workshop'],
            start_time: new Date('2024-09-12T09:30:00Z')
          },
          {
            activity_id: activityMap['Balinese Dance Class'],
            start_time: new Date('2024-09-12T11:30:00Z')
          },
          {
            activity_id: activityMap['Art Museum Tour'],
            start_time: new Date('2024-09-12T14:30:00Z')
          },
          {
            activity_id: activityMap['Balinese Dance Performance'],
            start_time: new Date('2024-09-12T18:00:00Z')
          }
        ]
      },
      TourImages: {
        create: [
          { url: '/tours/img/sacred_moments/sm1.jpg' },
          { url: '/tours/img/sacred_moments/sm2.jpg' },
          { url: '/tours/img/sacred_moments/sm3.jpg' }
        ]
      },
      Highlights: {
        create: [
          { description: 'Hands-on Canang Sari making workshop.' },
          {
            description:
              'Learn the art of Balinese dance from expert instructors.'
          },
          {
            description:
              'Explore classical and contemporary Balinese art at Ubud&apos;s top museums.'
          },
          { description: 'Experience an authentic Balinese dance performance.' }
        ]
      },
      OptionalFeatures: {
        create: [
          {
            description:
              'Private tours of exclusive art galleries, traditional Balinese houses, or more in-depth dance classes upon request.'
          }
        ]
      },
      Inclusions: {
        create: [
          { description: 'All materials for Canang Sari workshop.' },
          {
            description:
              'Certified dance instructor for the Balinese dance class.'
          },
          { description: 'Entrance fees for the art museum tour.' },
          {
            description: 'Tickets to a traditional Balinese dance performance.'
          },
          { description: 'Lunch at a local restaurant in Ubud on Day 1.' },
          {
            description: 'Accommodation in a guesthouse in Ubud for two nights.'
          }
        ]
      },
      Exclusions: {
        create: [
          { description: 'Personal expenses and gratuities.' },
          {
            description:
              'Additional meals beyond the included lunch and refreshments.'
          }
        ]
      },
      AdditionalInfos: {
        create: [
          {
            description:
              'Modest clothing is recommended for temple visits and workshops.'
          },
          {
            description: 'The minimum booking for this tour is 2 participants.'
          },
          {
            description:
              'Additional art workshops or custom tours are available upon request.'
          }
        ]
      }
    }
  })

  console.log(`Tour Package created: ${tourPackage.package_name}`)
}

main()
  .catch((e) => {
    console.error(e)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
