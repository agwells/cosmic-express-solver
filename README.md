# Cosmic Express level solver

This is a program to solve levels of the game "Cosmic Express" by brute force,
randomly attempting every possible path through the level until it finds one
that works.

I wrote this because I love the game, and found every level deliciously
frustrating but ultimately solveable. Until I got to the last one, Nova 7.
Try as I might, I couldn't get past that one. And since Cosmic Express is still
a newish game, no walkthroughs were available online. Since I was basically
trying to manually brute-force the game, I decided to make a computer do it
for me. :)

## Usage

`./cesolver.js [--non-interactive|-I] MAPFILE`

* You must provide the path to the mapfile at the command-line. This is the
file that describes the level to solve.
* By default, the program displays the solving attempts in progress via `curses`
(well, actually `blessed`, a `curses`-like NPM library).
** To deactivate the curses display, use the flag `--non-interactive` or `-I`
** In non-interactive mode, the program will print an update every 1,000,000
steps, and print the solution once it's found. (It also runs faster.)

## Mapfile syntax

The mapfile is a plain text file holding an ASCII representation of the Cosmic 
Express level. The map must be rectangular; that is, each line of the text file
must be the same length. If you're dealing with a level that doesn't have a
square floor, you'll need to pad it out into a rectangle using `#` walls.

* Terrain:
  * Empty cell: `.`
  * Wall/Obstacle: `#`
  * Track crossing: `+`
  * Wormholes: `*`
* Aliens & Houses for them:
  * Green alien: `G`
  * Green house: `g`
  * Orange alien: `O` (capital letter o)
  * Orange house: `o`
  * Purple alien: `P`
  * Purple house: `p`
  * Wildcard house: `?`
* Entrance and exit:
  * Entrance: `A`
  * Exit: `Z`
* More than one train car
  * First car: `A`
  * Following cars: `a`
  * You only need to represent passenger cars, *not* the leading "engine car" that comes in front of them. So for a level with two passenger cars, you'd put this at the start of the map: `aA`

For levels with multiple train cars, you should recess the exit into the wall of the
level, like so:

```
##..
Z...
##..
aA..
##..
```

## Limitations

* Only supports up to 3 cars
* Only supports one pair of warps
* Doesn't support [SPOILER]
* Doesn't support that thing where when the train goes between two aliens at the same time they bump against each other and neither one gets into the car.