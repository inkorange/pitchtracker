## Pitch Tunneling Visualization

It would be great to be able to visualize the effectiveness of a pitcher's pitch tunneling. Which is defined as:

Determining a pitcher's pitch tunneling visualization involves analyzing tracking data (like Trackman or Statcast) to map the, "Tunnel Point" (roughly 175–200ms before contact) where pitches share a nearly identical trajectory (within a few inches) before breaking to different locations at the plate.

Effective tunneling minimizes distance at this point while maximizing final, end-point distance.Key Metrics for Determining Tunneling:

- Release Point Consistency: The pitcher must release different pitches from the same slot.

- Initial Trajectory (Tunnel Point): The vertical/horizontal angles of the pitch 15–23 feet before the plate.

- Plate Distance (PLATEDIST): The final distance between two pitches.

- Velocity Gap: The difference in speed between pitches.

Visualization Techniques:

- 3D Pitch Trajectory Mapping: Using tools that plot the path of multiple pitches from release to home plate, specifically highlighting the "tunneling window" 15–20 feet from the plate.
- Tunnel Score Calculations: Metrics that create a, "Tunnel Score" which considers how close pitches are to one another at the decision point.
- Spin Mirroring: Identifying if the spin axis of two pitches are opposites, causing them to break in opposite directions.

Example: A fastball and a slider starting in the exact same 3-inch box 20 feet from the plate, with the fastball landing in the strike zone and the slider breaking out, indicates high-quality tunneling

### Initial Iteration

When we are in the pitcher visualziation page (IE: /pitcher/694973) we can get a high aggregation of pitches broken down by season, or game, or outcome.

With those pitchesm, we need to come up with an algorithm that can determine the deviation between the different pitches thrown before they deviate by a certain % after being released by the hand.

Say we determine the end of the tunnel when the average of the different pitch types (fastball vs a curve vs a slider) deviate by 1 baseball width.

So an example of a very good tunnel is the longer it is based on the different pitches thrown, if a pitcher's fastball and curveball both come out of the same slot and don't start breaking until 15-20 feet down the mound by 1 baseball deviation (~3") then it's hard for the hitter to decifer the type of pitch until it's too late. This is also effected by the release point and outfront release distance of the pitcher, making that tunneling even closer to the batter.

A bad example is if a pitcher throws a fastball and curveball from different release points, it will quickly deviate in flight path, and this will tip the pitch to the batter.

### Visualization

Once we have determined the tunneling metrics of the dataset of pitches, we need to overlay this on the pitch ribbon paths to show a cone encircling the pitches. It will always start at the average release point, and be as wide and bent as the aggregatew of the pitch paths until that 1 baseball width deviation is determined. We will average that all out across all the selected pitches. We aggregate this by pitch type and get the average. Then the tunnel end distance point is the average of all the pitch type averages.

NOTE: We might need to tweak some of the calculations once we see it visualized

### UX for Implementation

There should be a toggle on the pitcher card on the left that allows to show/hide pitch tunneling. Toggling this on will set all the pitches shown to be turned into a .25% opacity, and the tunnel shape (similar to a open ended cone on both ends) will encompas the pitch paths, as it should wrap most of the pitches (less any outliers). The tunnel 3D shape is rendered at .75 opacity.

When the pitch filters on the left are changed, it needs to re-calculate the tunnel rendering.

** DONE **

## Pitcher - Batter Filtering

When on the pitcher view, I want to be able to search any batter from the current season selected form the pitcher's filters, and see all the at bats against that batter. The list if ABs vs that pitcher will be listed on a new pop-up listing, and the user can select any of the at-bats.

The idea is that we can quickly see the matchups of any pitcher with any batter without having to find the game where they pitched. Its a quick reference to see how Paul Skenes has attacked Juan Soto across the entire year.

### Integration

We will present a button below the pitcher panel, as a stand-alone, that says "Find At Bats". We will do this one batter at a time, not select many batters to look through. If the user wants a different batter, for now they need to search again.

Adding a batter, like "Mike Trout" will have a type-head where the user can select the batter. Upon selecting the batter, we will run a API call to get all the at-bats that this hitter has had in the selected season only.

If any exist, there will be a panel that lists all the AB records, with the game date and team vs on the card, similar to the /at-bat/[gameId] listing page, but inset on the pitcher page.

If a batter has no games facing the pitcher, a message will show saying, no matchups found.

There will be a listing of all the matchups between the pitcher and batter that can be quickly clicked through. We should also list the outcome of each at bat, like Strikeout, double, homerun, walk...

### At Bat Mode

If the user selects one of the found at-bat entries, we will enter a very similar at-bat view that we already have for the data on the at-bat. But it will be rendering on the pitcher page.

When we are in at-bat mode on the pitcher page, the controls for Pitch Type, Outcome, Batter Side are collapsed and removed, since they have no effect on the at-bat mode. This will also give us a little more real estate to present the batter UI below it.

Any of the current filters in place will be ignored when in at-bat mode. But if the user leaves at-bat mode, they are re-applied, and the filter menu is presented again.

### UX Considerations

Stay on the same 3d scene, do not re-render the scene. We are just changing the pitch playback mode to use the same on from at-bat mode.

The url should also reflect this so we can send this to a friend and show them all the matchups in 2026 of Skeves vs Soto.

### Mobile Considerations

The batter selector on mobile will be within the pitcher panel, that is collapsed by deafult. It will be situated in there, with the listing of games showing within the same panel after finding a valid batter.

** DONE **

## Rankings

Since we get game data daily, can we also run a query to do daily rankings with different categories for the top 5 pitchers who rank on:

1. Top 5 Velo
2. Top 5 Whiff Rates
3. Top 5 Most Strikeouts

Any other suggestions

### UX

This should be listed on the homepage

** DONE **


## AI Integration

### Purpose

A truly immersive analytics tool would work best if we are able to open a chat input and naturally type the analysis we want, or use a speech to text feature, using AI to describe the analytcis. An example query would be, "Show me all of Nolan McLean's curveballs that resulted in a strikeout in 2026", or "Get me all of the match-ups between Paul Skenes and Francisco Lindor"

### UX

I'd like a colorful icon sitting in the lower-left, and when we click it, it opens up into a prompt at the bottom of the page for the user to either type in what they want, or offer a mic icon where they can talk to type thier request.

The AI analyzes what they asked for, and constructs the smrt url and redirects to that page to show the data they want


### Technology

I am looking for suggestions on how to implement this, on my othjer projects I have used Vercel's AI to do this, but it needs to be very gated to only respond to requests for our app. Ity needs to interpret an ask, and run APIs to get the ids of the pitchers or batters, and construct the url that will present the data.

It might require extending some of the url params to be able to retrieve data more easily. One issue I see already is that there is no url parameter for turning on the tunneling on the pitcher page, so we would need to add that to the url, if the user asks in this chat, show me the tunneling for these pitches.

We might want to write a SKILL.md file that explains how every new feature or option we add to this project requires a URL param to either A. Share the snapshot of the data we are visualizing directly wioth someone else, or B. make it easy for an Ai to construct a visualization page from a text prompt.

### Sample Entries

"Show me all of Paul Skenes curveballs in 2025"
"Now add fastballs to this pitch spread and show me tunneling"
"show me all the fastballs thrown against left handed hitters"

"Show me all the matchups between Cease and Lindor"

"Show me yesterday's games"
"Show me all the hitting matchups form yesterday for Juan Soto"

## Batter-aware Pitch Sequencing

Extension of the season-level Sequencing card on `/pitcher/[id]?view=stats`.
When a batter is selected via the existing `?vsBatter=<mlb_id>` URL param, the
sequencing matrix narrows to pitches thrown to that specific batter only —
answering "how does Skenes attack Soto specifically, and what does he go to
after the fastball-up?".

### Scope

- Server-side: the arsenal endpoint accepts `vsBatter`, adds `batter_id` to
  the SELECT, and filters `cached` by batter before passing into
  `buildSequencingMatrix`.
- Card hint shows the batter context ("Sequencing · 12 ABs vs Witt Jr.")
  when scoped.
- Help / AI prompt translation rule: "his sequencing vs <batter>" →
  `/pitcher/<id>?view=stats&vsBatter=<batter mlb_id>`.

### Why later

The first sequencing PR ships the season-level matrix only — it's enough to
prove out the UI and the data path. The batter-aware version is a clean
data-narrowing follow-up, not a rebuild.

## Sequencing Consistency Across Games

Per-game variance / drift in a pitcher's sequencing patterns. Answers "is he
calling the same pattern every game, or has he changed his approach?".

### Two visualization candidates

- **Per-game small multiples**: one tiny matrix per game in the selection,
  laid out as a grid. Visual scan for "same shape every time" vs
  game-to-game variance. Heavy at 30+ games per season; works best for
  shorter windows (last 5 starts, etc.).
- **Variance timeline**: a single chart with one line per matrix row,
  showing per-game KL-divergence (or entropy delta) of that game's matrix
  vs the season's. Spikes = "changed his approach that day". Compact, one
  card.

### Scope

- New stats card next to the season-level Sequencing card.
- Reuses the same `buildSequencingMatrix` function, called per-game on the
  bucketed pitches.
- URL param to switch view (`?seqView=multiples|timeline`?) — TBD.
- Combines cleanly with `?vsBatter=` once that's wired: "how has his
  approach to this batter shifted across the season?".

### Why later

Needs the season-level + batter-aware matrices in place first so the
"variance vs what?" baseline is well-defined. Ship those, then build this on
top.