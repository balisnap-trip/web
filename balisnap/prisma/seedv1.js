const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  // Insert Activities
  const activitiesData = [
    {
      activity_name: 'Horse Riding',
      short_description: 'Experience horse riding along a beautiful beach.',
      description:
        'Enjoy a peaceful and refreshing horse-riding experience at Saba Beach, guided by experienced instructors.',
      duration_hours: 1,
      base_price: 0,
      location: 'Saba Beach, Blahbatuh, Gianyar',
      thumbnail_url: '/activities/img/horse_riding.jpg'
    },
    {
      activity_name: 'Turtle Conservation',
      short_description: 'Learn about sea turtles and their conservation.',
      description:
        'Visit Saba Asri Turtle Conservation and learn about sea turtle conservation efforts.',
      duration_hours: 2,
      base_price: 0,
      location: 'Saba Beach, Blahbatuh, Gianyar',
      thumbnail_url: '/activities/img/turtle_conservation.jpg'
    },
    {
      activity_name: 'Cultural Tour',
      short_description: 'Explore traditional Balinese culture and heritage.',
      description:
        'Visit Puri Blahbatuh and explore the rich history and architecture of a traditional Balinese royal palace.',
      duration_hours: 2,
      base_price: 0,
      location: 'Puri Blahbatuh, Gianyar',
      thumbnail_url: '/activities/img/cultural_tour.jpg'
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

  // Insert Tour Package
  const tourPackage = await prisma.tourPackage.create({
    data: {
      package_name: 'Hidden Gem',
      slug: 'hidden-gem',
      short_description:
        "Embark on an adventure to Bali's secluded and rarely known locations.",
      description:
        "Embark on an adventure to Bali's secluded and rarely known locations. From remote beaches to waterfalls hidden deep within the jungle, we guide you to spots that offer stunning, untouched beauty. These are places where you can truly immerse yourself in nature, away from the typical tourist crowds, offering an unparalleled experience for both exploration and photography.",
      duration_days: 1,
      price_per_person: 130,
      price_per_child: null,
      min_booking: 2,
      max_booking: null,
      is_featured: true,
      thumbnail_url: '/tours/img/hg/hg1.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      TourItineraries: {
        create: [
          {
            activity_id: activityMap['Horse Riding'],
            start_time: new Date('2024-09-10T06:00:00Z')
          },
          {
            activity_id: activityMap['Turtle Conservation'],
            start_time: new Date('2024-09-10T09:00:00Z')
          },
          {
            activity_id: activityMap['Cultural Tour'],
            start_time: new Date('2024-09-10T10:30:00Z')
          }
        ]
      },
      TourImages: {
        create: [
          { url: '/tours/img/hg/hg1.jpg' },
          { url: '/tours/img/hg/hg2.jpg' },
          { url: '/tours/img/hg/hg3.jpg' },
          { url: '/tours/img/hg/hg4.jpg' },
          { url: '/tours/img/hg/hg5.jpg' },
          { url: '/tours/img/hg/hg6.jpg' },
          { url: '/tours/img/hg/hg7.jpg' },
          { url: '/tours/img/hg/hg8.jpg' },
          { url: '/tours/img/hg/hg9.jpg' },
          { url: '/tours/img/hg/hg10.jpg' },
          { url: '/tours/img/hg/hg11.jpg' },
          { url: '/tours/img/hg/hg12.jpg' }
        ]
      },
      Highlights: {
        create: [
          {
            description:
              'Horse-riding at Saba Beach with stunning sunrise views.'
          },
          {
            description:
              'Beachside breakfast with local Balinese dishes and coffee.'
          },
          {
            description:
              'Visit Saba Asri Turtle Conservation and release baby turtles.'
          },
          {
            description:
              'Explore Puri Blahbatuh, a traditional royal palace in Gianyar.'
          }
        ]
      },
      OptionalFeatures: {
        create: [
          {
            description:
              'Additional Trip to Waterfall or Museum: For those who wish to extend their journey, there is an option to visit Tegenungan Waterfall, Kemenuh Mask Museum, or another recommended site. This additional trip can extend your tour up to 5:00 PM. These additional destinations offer more unique experiences of Bali’s natural beauty and cultural richness.'
          }
        ]
      },
      Inclusions: {
        create: [
          {
            description: 'Horse riding session with a professional guide.'
          },
          {
            description:
              'Breakfast box with authentic Balinese coffee at Saba Beach.'
          },
          {
            description: 'Guided tour at Saba Asri Turtle Conservation.'
          },
          {
            description: 'Tukik (baby turtle) release experience.'
          },
          {
            description:
              'Visit to Puri Blahbatuh with a local guide, including a historical overview from the 17th century.'
          },
          {
            description:
              'Pickup and drop-off service included for areas within Jimbaran, Kuta, Seminyak, Ubud, and surroundings.'
          }
        ]
      },
      Exclusions: {
        create: [
          {
            description: 'Additional expenses.'
          }
        ]
      },
      AdditionalInfos: {
        create: [
          {
            description:
              'Please wear comfortable clothing and bring sunscreen, a hat, and a camera.'
          },
          {
            description: 'This tour is suitable for all ages.'
          },
          {
            description:
              'If the tour exceeds the 6-hour duration, an additional charge of 100,000 IDR per hour will apply.'
          },
          {
            description: 'The package requires a minimum booking of 2 pax.'
          },
          {
            description:
              'Optional trips to Tegenungan Waterfall, Kemenuh Mask Museum, or other recommended sites can be added on-site with additional costs.'
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
