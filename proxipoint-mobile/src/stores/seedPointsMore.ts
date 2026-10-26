/**
 * More sample Points for development: 30 more around the default area (Erie) and 10 in Fort
 * Collins, all using the hashtags in the filter list (#LiveMusic, #FoodTrucks, #FarmersMarket,
 * #TechMeetup, #Pickleball, #BoardGames, #TriviaNight, #OpenMic, #ArtWalk, #Yoga, #Volunteer,
 * #Hiking). Same shape as SEED_POINTS in useDiscoveryStore; `near` places a Point around another
 * city's center instead of the default location.
 */

export interface MoreSeedPoint {
  id: string;
  title: string;
  tags: string[];
  venue: string;
  host: string;
  description: string;
  east: number;
  north: number;
  startInMin: number;
  at?: { dayOffset: number; hour: number; minute: number };
  lengthMin: number;
  attendeeCount: number;
  maxAttendance?: number | null;
  requiresApproval?: boolean;
  radiusMeters: number;
  /** Center to place around (default: the default location). */
  near?: { latitude: number; longitude: number };
}

export const FORT_COLLINS = { latitude: 40.5853, longitude: -105.0844 };

type Row = [
  id: string,
  title: string,
  tags: string[],
  venue: string,
  host: string,
  description: string,
  east: number,
  north: number,
  start: number | { dayOffset: number; hour: number; minute: number },
  lengthMin: number,
  attendeeCount: number,
  maxAttendance?: number | null,
];

const row = ([id, title, tags, venue, host, description, east, north, start, lengthMin, attendeeCount, maxAttendance]: Row, near?: MoreSeedPoint['near']): MoreSeedPoint => ({
  id,
  title,
  tags,
  venue,
  host,
  description,
  east,
  north,
  startInMin: typeof start === 'number' ? start : 0,
  at: typeof start === 'number' ? undefined : start,
  lengthMin,
  attendeeCount,
  maxAttendance: maxAttendance ?? null,
  radiusMeters: attendeeCount > 40 ? 1000 : attendeeCount > 15 ? 750 : 500,
  near,
});

const day = (dayOffset: number, hour: number, minute = 0) => ({ dayOffset, hour, minute });

// ---- Erie area (30) ---------------------------------------------------------------------------
const ERIE: Row[] = [
  ['pt-x-porch-blues', 'Porch Blues Session', ['#LiveMusic', '#Blues'], 'Briggs Street Porch', '@porchblues', 'Acoustic blues on the porch. Bring a chair; tips go to the players.', -620, -120, -20, 120, 18],
  ['pt-x-brewery-bluegrass', 'Bluegrass at the Brewery', ['#LiveMusic', '#Bluegrass'], 'Old Town Brewing', '@oldtownbrewing', 'Four-piece bluegrass band on the patio. Kids welcome until 8.', 520, 610, 90, 150, 52, 150],
  ['pt-x-garage-rock', 'Garage Rock Night', ['#LiveMusic', '#Rock'], 'The Loading Dock', '@loadingdockerie', 'Three local bands, $5 at the door, loud and fun.', 780, -320, day(1, 20, 0), 180, 64, 200],
  ['pt-x-dumpling-truck', 'Dumpling Truck Lunch', ['#FoodTrucks', '#Dumplings'], 'Library Lot', '@dumplingdash', 'Pork, veggie and chili-crisp dumplings until they sell out.', -150, -520, -30, 120, 22],
  ['pt-x-bbq-truck', 'Smoke & Spoke BBQ Truck', ['#FoodTrucks', '#BBQ'], 'Coal Creek Trailhead Lot', '@smokeandspoke', 'Brisket, pulled pork and cold brew for the trail crowd.', -880, -260, 30, 180, 15],
  ['pt-x-dessert-trucks', 'Dessert Truck Night', ['#FoodTrucks', '#Dessert'], 'Central Park Plaza', '@sweetwheels', 'Crepes, gelato and mini donuts. Music on the lawn.', 360, 440, day(1, 18, 30), 150, 41],
  ['pt-x-saturday-market', 'Saturday Morning Market', ['#FarmersMarket', '#LocalFood'], 'Town Hall Green', '@eriemarket', 'Thirty vendors: produce, eggs, honey, bread and flowers.', 60, 120, day(1, 8, 0), 240, 120],
  ['pt-x-honey-stand', 'Honey & Hive Pop-up', ['#FarmersMarket', '#Honey'], 'Briggs Street Corner', '@hivehaus', 'Raw local honey tastings and a live observation hive.', -480, 40, 60, 120, 11],
  ['pt-x-twilight-market', 'Twilight Makers Market', ['#FarmersMarket', '#Makers'], 'Erie Community Center', '@eriemakers', 'Evening market with crafts, candles and hot cider.', 640, -760, day(2, 17, 0), 180, 58],
  ['pt-x-react-native', 'React Native Night', ['#TechMeetup', '#ReactNative'], 'Coworking Loft', '@frontrangedevs', 'Two talks on Expo and offline maps, then Q&A.', 880, -560, day(1, 18, 0), 120, 33, 50],
  ['pt-x-ai-coffee', 'AI & Coffee Breakfast', ['#TechMeetup', '#AI'], 'Grind House Café', '@aiandcoffee', 'Casual breakfast chat about what everyone is building.', 300, -80, day(1, 7, 30), 90, 19, 25],
  ['pt-x-hack-night', 'Civic Hack Night', ['#TechMeetup', '#OpenData'], 'Erie Library Meeting Room', '@codeforerie', 'Work on open-data projects for the town. All skills welcome.', -120, -560, 150, 180, 16, 30],
  ['pt-x-morning-pickleball', 'Morning Pickleball Drills', ['#Pickleball', '#Drills'], 'Meadow Park Courts', '@dinkcrew', 'Coach-led drills for 3.0–3.5 players. Bring water.', -700, 300, day(1, 7, 0), 90, 12, 16],
  ['pt-x-pickleball-ladder', 'Pickleball Ladder League', ['#Pickleball', '#League'], 'Erie Rec Center Courts', '@erierec', 'Weekly ladder, rotating partners, scores posted after.', 420, -880, 120, 120, 24, 32],
  ['pt-x-catan-night', 'Catan & Friends', ['#BoardGames', '#Catan'], 'Dice & Brews', '@diceandbrews', 'Beginner tables plus a Cities & Knights table.', 200, 260, -10, 180, 21, 40],
  ['pt-x-chess-park', 'Chess in the Park', ['#BoardGames', '#Chess'], 'Coal Creek Park Pavilion', '@eriechess', 'Boards provided. Blitz from 6, casual games all evening.', -330, 720, 75, 150, 13],
  ['pt-x-game-library', 'Family Game Library Hour', ['#BoardGames', '#Family'], 'Erie Library', '@erielibrary', 'Borrow a game, play it here. Ages 6 and up.', -100, -600, day(1, 15, 0), 90, 17],
  ['pt-x-movie-trivia', 'Movie Trivia Night', ['#TriviaNight', '#Movies'], 'The Brickhouse Tap', '@quizmasterjen', 'Film quotes, posters and soundtrack rounds.', 900, 320, day(1, 19, 0), 120, 36, 60],
  ['pt-x-music-bingo', 'Music Bingo', ['#TriviaNight', '#MusicBingo'], 'Old Town Brewing', '@oldtownbrewing', 'Name that tune, mark your card, win a growler.', 540, 590, day(2, 19, 30), 120, 44, 80],
  ['pt-x-poetry-open-mic', 'Poetry Open Mic', ['#OpenMic', '#Poetry'], 'Grind House Café', '@grindhouseerie', 'Sign-up at 6:45, five minutes each. Listeners welcome.', 320, -60, 200, 120, 14],
  ['pt-x-comedy-open-mic', 'Comedy Open Mic', ['#OpenMic', '#Comedy'], 'The Loading Dock', '@loadingdockerie', 'Five-minute sets for new and working comics.', 760, -300, day(1, 21, 0), 120, 29, 70],
  ['pt-x-songwriter-round', 'Songwriter Round', ['#OpenMic', '#Songwriters'], 'The Rusty Anchor', '@rustyanchor', 'Three songwriters trade songs in the round.', -260, 180, day(2, 18, 0), 120, 25, 60],
  ['pt-x-mural-tour', 'Downtown Mural Tour', ['#ArtWalk', '#Murals'], 'Briggs Street Mural Wall', '@oldtownarts', 'Guided walk past nine murals with two of the artists.', -560, 80, 45, 90, 20, 30],
  ['pt-x-pottery-show', 'Pottery Studio Open House', ['#ArtWalk', '#Ceramics'], 'Kiln & Co. Studio', '@kilnandco', 'Wheel demos every half hour; seconds sale on the patio.', 120, 860, day(1, 11, 0), 240, 27],
  ['pt-x-sunrise-yoga', 'Sunrise Yoga on the Lake', ['#Yoga', '#Sunrise'], 'Erie Lake Dock', '@flowwithmaya', 'Slow flow as the sun comes up. Mats available.', -820, 820, day(1, 6, 30), 60, 16, 25],
  ['pt-x-power-yoga', 'Power Yoga in the Park', ['#Yoga', '#Fitness'], 'Coal Creek Park Lawn', '@coalcreekfit', 'High-energy vinyasa on the grass. Intermediate.', -300, 680, -15, 60, 19, 30],
  ['pt-x-trail-cleanup', 'Coal Creek Trail Cleanup', ['#Volunteer', '#Outdoors'], 'Coal Creek Trailhead', '@greenerie', 'Two-hour trail cleanup. Gloves and bags provided.', -900, -300, day(1, 9, 0), 120, 23, 40],
  ['pt-x-food-bank', 'Food Bank Sorting Shift', ['#Volunteer', '#FoodBank'], 'Erie Community Pantry', '@eriepantry', 'Sort and pack donations for the weekend boxes.', 450, -420, 100, 150, 11, 20],
  ['pt-x-full-moon-hike', 'Full Moon Hike', ['#Hiking', '#NightHike'], 'Mesa Trailhead', '@trailtribe', 'Easy 3-mile loop under the full moon. Headlamps on standby.', -920, 860, day(1, 19, 30), 120, 26, 35],
  ['pt-x-dog-hike', 'Dog-Friendly Hike', ['#Hiking', '#Dogs'], 'Erie Open Space Trail', '@pawsontrails', 'Leashed pups welcome. Moderate 4-mile out-and-back.', 860, 880, day(2, 9, 0), 150, 18, 30],
];

// ---- Fort Collins (10) ------------------------------------------------------------------------
const FORT_COLLINS_ROWS: Row[] = [
  ['pt-fc-oldtown-jazz', 'Old Town Square Jazz', ['#LiveMusic', '#Jazz'], 'Old Town Square Stage', '@foco_music', 'Free outdoor jazz quartet on the square.', 40, 60, -25, 120, 48, 200],
  ['pt-fc-truck-rally', 'FoCo Food Truck Rally', ['#FoodTrucks', '#TacoTuesday'], 'Civic Center Park', '@focotrucks', 'Twelve trucks, live DJ and lawn games.', -320, -180, 40, 180, 71],
  ['pt-fc-larimer-market', 'Larimer County Farmers Market', ['#FarmersMarket', '#LocalFood'], 'Courthouse Lot', '@larimermarket', 'Produce, pastries and coffee from forty local growers.', -150, -420, day(1, 8, 0), 240, 140],
  ['pt-fc-csu-devs', 'CSU Dev Meetup', ['#TechMeetup', '#WebDev'], 'Innosphere Ventures', '@focodevs', 'Show-and-tell for side projects, then tacos.', 610, -700, day(1, 18, 0), 120, 34, 60],
  ['pt-fc-rolland-pickleball', 'Rolland Moore Open Play', ['#Pickleball', '#OpenPlay'], 'Rolland Moore Park Courts', '@focopickle', 'Paddle stacking on eight courts. All levels.', -880, -900, 60, 180, 30],
  ['pt-fc-game-cafe', 'Board Game Café Night', ['#BoardGames', '#Strategy'], 'Haven Games', '@havengames', 'Teachers on hand for anything on the wall.', 280, 180, -45, 240, 26, 50],
  ['pt-fc-brewery-trivia', 'Brewery Trivia', ['#TriviaNight', '#Pub'], 'Odell Brewing Patio', '@odelltrivia', 'Six rounds, teams of up to six, prizes in beer.', 900, 620, day(1, 19, 0), 120, 55, 90],
  ['pt-fc-lyric-open-mic', 'Lyric Open Mic', ['#OpenMic', '#Acoustic'], 'The Lyric', '@thelyricfoco', 'Two songs or ten minutes, whichever is first.', 520, 880, day(2, 19, 0), 150, 22, 60],
  ['pt-fc-first-friday', 'First Friday Gallery Walk', ['#ArtWalk', '#Gallery'], 'Old Town Galleries', '@focoarts', 'Twenty galleries open late with live demos.', -60, 300, day(1, 17, 0), 180, 63],
  ['pt-fc-horsetooth-hike', 'Horsetooth Rock Hike', ['#Hiking', '#Outdoors'], 'Horsetooth Mountain Trailhead', '@focotrails', 'Strenuous 5-mile climb to the rock. Start early, bring layers.', -920, 920, day(1, 7, 0), 240, 21, 30],
];

export const MORE_SEED_POINTS: MoreSeedPoint[] = [
  ...ERIE.map((r) => row(r)),
  ...FORT_COLLINS_ROWS.map((r) => row(r, FORT_COLLINS)),
];
