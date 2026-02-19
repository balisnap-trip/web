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
      activity_name: 'Turtle Release',
      short_description:
        'Heartwarming experience releasing baby turtles back to the sea.',
      description:
        'Participate in turtle release activities at the Saba Asri Turtle Conservation and learn about sea turtle conservation efforts.',
      duration_hours: 1,
      base_price: 0,
      location: 'Saba Beach, Blahbatuh, Gianyar',
      thumbnail_url: '/activities/img/turtle_release.jpg'
    },
    {
      activity_name: 'Waterfall Visit',
      short_description:
        'Explore a hidden waterfall deep in Bali&apos;s jungle.',
      description:
        'Visit one of Bali&apos;s hidden waterfalls, such as Tukad Cepung or Goa Rang Reng, and enjoy the tranquil and beautiful surroundings.',
      duration_hours: 2,
      base_price: 0,
      location: 'Gianyar or Klungkung',
      thumbnail_url: '/activities/img/waterfall_visit.jpg'
    },
    {
      activity_name: 'Rice Terrace Visit',
      short_description:
        'A scenic walk through Bali&apos;s famous rice terraces.',
      description:
        'Explore the beautiful rice terraces in Tegallalang, where you&apos;ll get a chance to experience the peaceful rural life of Bali and interact with local farmers.',
      duration_hours: 2,
      base_price: 0,
      location: 'Tegallalang, Gianyar',
      thumbnail_url: '/activities/img/rice_terrace.jpg'
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
      package_name: 'Hidden Gems: Bali&apos;s Unseen Natural Beauty',
      slug: 'hidden-gems-bali',
      short_description:
        "Discover Bali's secluded locations from hidden waterfalls to tranquil beaches.",
      description:
        "Embark on a three-day journey that blends adventure, tranquility, and cultural immersion. Explore Bali's hidden waterfalls, serene rice terraces, and more. Ideal for those looking to uncover the untouched beauty of Bali's natural landscapes.",
      duration_days: 3,
      price_per_person: 600,
      price_per_child: null,
      min_booking: 2,
      max_booking: null,
      is_featured: true,
      thumbnail_url: '/tours/img/hidden_gems/hg1.jpg',
      created_at: new Date(),
      updated_at: new Date(),
      TourItineraries: {
        create: [
          {
            activity_id: activityMap['Horse Riding'],
            start_time: new Date('2024-09-10T08:00:00Z')
          },
          {
            activity_id: activityMap['Turtle Release'],
            start_time: new Date('2024-09-10T09:00:00Z')
          },
          {
            activity_id: activityMap['Waterfall Visit'],
            start_time: new Date('2024-09-10T11:30:00Z')
          },
          {
            activity_id: activityMap['Rice Terrace Visit'],
            start_time: new Date('2024-09-10T15:00:00Z')
          }
        ]
      },
      TourImages: {
        create: [
          { url: '/tours/img/hidden_gems/hg1.jpg' },
          { url: '/tours/img/hidden_gems/hg2.jpg' },
          { url: '/tours/img/hidden_gems/hg3.jpg' }
        ]
      },
      Highlights: {
        create: [
          {
            description: 'Horse riding at Saba Beach with scenic coastal views.'
          },
          { description: 'Turtle release at Saba Asri Turtle Conservation.' },
          { description: 'Visit to hidden waterfalls, such as Tukad Cepung.' },
          { description: 'Explore the beautiful Tegallalang rice terraces.' }
        ]
      },
      OptionalFeatures: {
        create: [
          {
            description:
              'Extend your tour to include a visit to a traditional market or additional waterfall exploration.'
          }
        ]
      },
      Inclusions: {
        create: [
          { description: 'Horse riding session with guide.' },
          { description: 'Turtle release activity and conservation tour.' },
          { description: 'Guided visit to the waterfall and rice terraces.' },
          { description: 'Lunch at a local restaurant.' },
          { description: 'Accommodation at Eco Villa and Glamping site.' },
          { description: 'Jeep Tour for sunrise at Mount Batur.' }
        ]
      },
      Exclusions: {
        create: [
          { description: 'Personal expenses and gratuities.' },
          { description: 'Optional spa services or additional activities.' }
        ]
      },
      AdditionalInfos: {
        create: [
          {
            description:
              'Comfortable clothing is recommended for trekking and outdoor activities.'
          },
          { description: 'Minimum booking of 2 participants.' },
          {
            description:
              'Additional trips to other sites are available upon request with extra fees.'
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
