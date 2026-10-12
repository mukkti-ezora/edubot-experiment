"""EduBot starter library: three college courses for the demo institution (Ashford).

Lesson text is original. Videos are curated YouTube embeds from educational channels, each
verified to exist (YouTube oEmbed) on 2026-10-08. Animations name interactive components the
web app renders (projectile, derivative, loop).
"""

from __future__ import annotations


def yt(video_id: str, title: str, source: str) -> dict:
    return {"url": f"https://www.youtube-nocookie.com/embed/{video_id}", "title": title, "source": source}


PROJECTILE = {
    "kind": "projectile",
    "params": {"speed": 20, "angle": 45, "gravity": 9.8},
    "caption": "Change the launch speed and angle and watch the path.",
    "alt": "A projectile launched at 20 m/s and 45 degrees rises to about 10.2 m and lands about 40.8 m away. "
           "Steeper angles go higher but not as far; 45 degrees gives the longest range on level ground.",
}
DERIVATIVE = {
    "kind": "derivative",
    "params": {"fn": "x^2", "x": 1},
    "caption": "Move the point along the curve; the tangent line's slope is the derivative.",
    "alt": "For f(x) = x squared, the tangent at x = 1 has slope 2, at x = 2 slope 4, and at x = 0 slope 0: "
           "the derivative is 2x.",
}
LOOP = {
    "kind": "loop",
    "params": {
        "code": ["total = 0", "for n in range(1, 5):", "    total = total + n", "print(total)"],
        "steps": [
            {"line": 0, "vars": {"total": 0}},
            {"line": 1, "vars": {"total": 0, "n": 1}},
            {"line": 2, "vars": {"total": 1, "n": 1}},
            {"line": 1, "vars": {"total": 1, "n": 2}},
            {"line": 2, "vars": {"total": 3, "n": 2}},
            {"line": 1, "vars": {"total": 3, "n": 3}},
            {"line": 2, "vars": {"total": 6, "n": 3}},
            {"line": 1, "vars": {"total": 6, "n": 4}},
            {"line": 2, "vars": {"total": 10, "n": 4}},
            {"line": 3, "vars": {"total": 10, "n": 4}, "output": "10"},
        ],
    },
    "caption": "Step through the loop one line at a time and watch the variables change.",
    "alt": "The loop adds 1, 2, 3 and 4 to total in turn, so total goes 0, 1, 3, 6, 10, and the program prints 10.",
}

# (code, section code, title, subject, summary, modules[(title, lessons[(title, minutes, body, video, animation)])])
COURSES = [
    ("PHY101", "PHY101-A", "Physics 101", "physics",
     "Motion, forces and energy: the core ideas of classical mechanics.",
     [
         ("Motion", [
             ("Displacement and velocity", 10,
              "## Where you are versus how far you went\n\n"
              "**Displacement** is the change in position, including direction. Walk 3 m east and 3 m back "
              "and your displacement is 0 m, even though you covered 6 m of **distance**.\n\n"
              "**Velocity** is displacement divided by time. If a cyclist moves 120 m east in 20 s, the average "
              "velocity is 120 m / 20 s = 6 m/s east. Speed is the size of velocity without the direction.\n\n"
              "## Reading the sign\n\n"
              "Pick a positive direction first. Motion that way is positive; the opposite way is negative. "
              "A velocity of -4 m/s means 4 m/s in the negative direction.\n\n"
              "- Displacement: change in position, with direction (m)\n"
              "- Velocity: displacement per unit time (m/s)\n"
              "- Speed: how fast, ignoring direction",
              yt("ZM8ECpBuQYE", "Motion in a Straight Line", "CrashCourse"), None),
             ("Acceleration", 9,
              "## Changing velocity\n\n"
              "**Acceleration** is how quickly velocity changes: a = change in velocity / time. A car going from "
              "0 to 20 m/s in 5 s accelerates at 20 / 5 = 4 m/s per second, written 4 m/s².\n\n"
              "Acceleration can speed you up, slow you down, or change your direction. Slowing down while moving "
              "in the positive direction means the acceleration is negative.\n\n"
              "## Constant acceleration\n\n"
              "With constant acceleration a, starting velocity u and time t:\n\n"
              "- final velocity: `v = u + a·t`\n"
              "- displacement: `s = u·t + ½·a·t²`\n\n"
              "Near Earth's surface, a dropped object accelerates downward at about 9.8 m/s².",
              yt("ObHJJYvu3RE", "Derivatives (velocity and acceleration)", "CrashCourse"), None),
             ("Projectile motion", 12,
              "## Two motions at once\n\n"
              "A thrown ball moves sideways at a constant speed while gravity changes its vertical speed. "
              "Treat the horizontal and vertical parts separately, joined only by time.\n\n"
              "For launch speed v at angle θ on level ground (ignoring air resistance):\n\n"
              "- horizontal speed: `v·cos θ`, constant\n"
              "- vertical speed: starts at `v·sin θ` and falls by 9.8 m/s every second\n"
              "- time in the air: `2·v·sin θ / g`\n"
              "- range: `v²·sin(2θ) / g`, largest at 45°\n\n"
              "Try it in the animation: at 20 m/s and 45° the ball lands about 40.8 m away.",
              yt("w3BhzYI6zXU", "Vectors and 2D Motion", "CrashCourse"), PROJECTILE),
         ]),
         ("Forces", [
             ("Newton's laws", 11,
              "## Three laws that explain motion\n\n"
              "1. **Inertia.** An object keeps its velocity unless a net force acts on it.\n"
              "2. **F = m·a.** Net force equals mass times acceleration. Push a 2 kg cart with a net 6 N and it "
              "accelerates at 3 m/s².\n"
              "3. **Action and reaction.** If A pushes on B, B pushes back on A with an equal and opposite force.\n\n"
              "The key word is *net*: add every force on the object, with directions, before using F = m·a.",
              yt("kKKM8Y-u7ds", "Newton's Laws", "CrashCourse"), None),
             ("Free-body diagrams", 8,
              "## Draw before you calculate\n\n"
              "A free-body diagram shows one object as a dot with an arrow for every force acting **on** it.\n\n"
              "For a book resting on a table there are two forces: gravity pulling down (weight, m·g) and the "
              "table pushing up (the normal force). They balance, so the net force is zero and the book stays "
              "at rest.\n\n"
              "- Draw only forces on the chosen object, not forces it exerts.\n"
              "- Label each arrow (weight, normal, friction, tension, applied).\n"
              "- Choose positive directions, then write F_net = m·a for each direction.",
              None, None),
         ]),
         ("Energy", [
             ("Work and kinetic energy", 10,
              "## Energy of motion\n\n"
              "**Work** is force times the distance moved in the direction of the force: W = F·d. Lifting with "
              "10 N through 2 m does 20 J of work.\n\n"
              "**Kinetic energy** is the energy of motion: KE = ½·m·v². A 2 kg ball at 3 m/s has "
              "½ × 2 × 3² = 9 J.\n\n"
              "The **work-energy theorem** links them: net work done on an object equals its change in "
              "kinetic energy.",
              yt("w4QFJb9a8vo", "Work, Energy, and Power", "CrashCourse"), None),
             ("Conservation of energy", 9,
              "## Energy changes form, the total stays\n\n"
              "In a closed system with no friction, kinetic plus potential energy stays constant. A ball dropped "
              "from height h trades gravitational potential energy (m·g·h) for kinetic energy as it falls.\n\n"
              "Dropped from 5 m, it reaches the ground at v = √(2·g·h) = √(2 × 9.8 × 5) ≈ 9.9 m/s, whatever "
              "its mass.\n\n"
              "With friction, some energy becomes heat, so the motion energy falls but the total energy is "
              "still conserved.",
              None, None),
         ]),
     ]),
    ("MTH201", "MTH201-B", "Calculus II", "mathematics",
     "Derivatives revisited, integration, and series.",
     [
         ("Derivatives revisited", [
             ("The derivative as a slope", 10,
              "## Instantaneous rate of change\n\n"
              "The derivative f'(x) is the slope of the tangent line to the curve at x. It measures how fast f "
              "changes right at that point.\n\n"
              "For f(x) = x², the slope at x is 2x: at x = 1 it is 2, at x = 3 it is 6, and at x = 0 the curve "
              "is momentarily flat.\n\n"
              "Formally, `f'(x) = lim(h→0) [f(x+h) − f(x)] / h`. Use the animation to see the tangent tilt as "
              "you move along the curve.",
              yt("WUvTyaaNkzM", "The essence of calculus", "3Blue1Brown"), DERIVATIVE),
             ("Rules you will use daily", 9,
              "## Shortcuts that come from the limit\n\n"
              "- Power rule: d/dx xⁿ = n·xⁿ⁻¹\n"
              "- Sum rule: differentiate term by term\n"
              "- Product rule: (u·v)' = u'·v + u·v'\n"
              "- Chain rule: d/dx f(g(x)) = f'(g(x))·g'(x)\n\n"
              "Example: d/dx (3x⁴ + 2x) = 12x³ + 2. With the chain rule, d/dx (x² + 1)³ = 3(x² + 1)²·2x.",
              yt("9vKqVkMQHKk", "The paradox of the derivative", "3Blue1Brown"), None),
         ]),
         ("Integration", [
             ("Area and the definite integral", 12,
              "## Adding up thin slices\n\n"
              "The definite integral ∫ₐᵇ f(x) dx is the signed area between the curve and the x-axis from a to "
              "b. Approximate it with rectangles (a Riemann sum); the integral is the limit as the rectangles get "
              "thinner.\n\n"
              "## The fundamental theorem\n\n"
              "If F' = f, then ∫ₐᵇ f(x) dx = F(b) − F(a). So ∫₀² x² dx = [x³/3]₀² = 8/3.",
              yt("rfG8ce4nNh0", "Integration and the fundamental theorem of calculus", "3Blue1Brown"), None),
             ("Integration by parts", 11,
              "## Undoing the product rule\n\n"
              "`∫ u dv = u·v − ∫ v du`. Choose u to be something that gets simpler when differentiated.\n\n"
              "Example: ∫ x·eˣ dx. Let u = x, dv = eˣ dx, so du = dx and v = eˣ. Then "
              "∫ x·eˣ dx = x·eˣ − ∫ eˣ dx = x·eˣ − eˣ + C.\n\n"
              "A useful order for choosing u: logarithms, inverse trig, algebraic, trig, exponential.",
              None, None),
         ]),
         ("Series", [
             ("Sequences and convergence", 10,
              "## Does it settle down?\n\n"
              "A sequence converges if its terms approach a single number. 1/n converges to 0; (−1)ⁿ keeps "
              "jumping between −1 and 1, so it diverges.\n\n"
              "A series adds the terms of a sequence. The geometric series 1 + ½ + ¼ + ... converges to 2, "
              "while the harmonic series 1 + ½ + ⅓ + ... grows without bound even though its terms shrink.",
              None, None),
             ("Taylor polynomials", 12,
              "## Approximating functions with polynomials\n\n"
              "Near x = 0, eˣ ≈ 1 + x + x²/2! + x³/3!. Each added term matches one more derivative of the "
              "function at 0, so the approximation improves near that point.\n\n"
              "At x = 0.1 the four-term polynomial gives 1.105167, while eˣ = 1.105171: already correct to five "
              "decimal places.",
              yt("3d6DsjIBzJ4", "Taylor series", "3Blue1Brown"), None),
         ]),
     ]),
    ("CS110", "CS110-A", "Introduction to Programming", "computing",
     "Python from first principles: values, decisions, loops and functions.",
     [
         ("Getting started", [
             ("Values, variables and types", 9,
              "## Naming values\n\n"
              "A **variable** is a name for a value. `age = 19` stores 19 under the name `age`.\n\n"
              "Every value has a **type**:\n\n"
              "- `int`: whole numbers like `19`\n"
              "- `float`: decimals like `3.5`\n"
              "- `str`: text like `\"Ashford\"`\n"
              "- `bool`: `True` or `False`\n\n"
              "Types decide what operations make sense: `\"3\" + \"4\"` joins text into `\"34\"`, while "
              "`3 + 4` adds numbers to make `7`.",
              yt("k9TUPpGqYTo", "Strings: working with textual data", "Corey Schafer"), None),
             ("Making decisions", 10,
              "## if, elif, else\n\n"
              "```\nif score >= 70:\n    print(\"Pass\")\nelif score >= 60:\n    print(\"Resit\")\nelse:\n"
              "    print(\"Fail\")\n```\n\n"
              "Python checks each condition in order and runs only the first block whose condition is true. "
              "Indentation marks which lines belong to each block.",
              yt("DZwmZ8Usvnk", "Conditionals and Booleans", "Corey Schafer"), None),
         ]),
         ("Loops", [
             ("for loops", 11,
              "## Repeating with a counter\n\n"
              "```\ntotal = 0\nfor n in range(1, 5):\n    total = total + n\nprint(total)\n```\n\n"
              "`range(1, 5)` produces 1, 2, 3, 4 (it stops before 5). Each time round the loop, `n` takes the "
              "next value and the indented line runs. The program prints 10.\n\n"
              "Step through it in the animation and watch `total` change.",
              yt("6iF8Xb7Z3wQ", "Loops and iterations", "Corey Schafer"), LOOP),
             ("while loops and tracing", 10,
              "## Repeating until a condition fails\n\n"
              "```\ncount = 3\nwhile count > 0:\n    print(count)\n    count = count - 1\n```\n\n"
              "This prints 3, 2, 1. A while loop runs as long as its condition is true, so something inside the "
              "loop must eventually make it false, or it never stops.\n\n"
              "**Tracing** means writing down each variable's value after every line. It is the fastest way to "
              "find a bug in a loop.",
              None, None),
         ]),
         ("Functions", [
             ("Defining functions", 10,
              "## Name a piece of work\n\n"
              "```\ndef area(width, height):\n    return width * height\n\nprint(area(3, 4))\n```\n\n"
              "`def` defines a function with parameters; `return` sends a value back to the caller. "
              "`area(3, 4)` gives 12.\n\n"
              "Functions let you write a step once and reuse it, and give it a name that explains what it does.",
              yt("9Os0o3wzS_I", "Functions", "Corey Schafer"), None),
             ("Lists", 9,
              "## Many values, one name\n\n"
              "```\nmarks = [72, 65, 88]\nmarks.append(91)\nprint(len(marks), marks[0], marks[-1])\n```\n\n"
              "This prints `4 72 91`. Indexes start at 0, and `-1` means the last item. Loop over a list with "
              "`for mark in marks:`.",
              None, None),
         ]),
     ]),
]

# (course code, title, kind, days from now, points, demo student emails who already submitted)
ASSIGNMENTS = [
    ("PHY101", "Lab 1: Measuring g with a pendulum", "lab", -2, 20, []),
    ("PHY101", "Problem set 2: Kinematics", "assignment", 2, 15, []),
    ("PHY101", "Quiz: Newton's laws", "quiz", 5, 10, ["ingrid.abiodun@ashf.example.edu"]),
    ("PHY101", "Midterm", "quiz", 24, 50, []),
    ("MTH201", "Problem set 3: Integration by parts", "assignment", 3, 15, []),
    ("MTH201", "Quiz: Series convergence", "quiz", 9, 10, []),
    ("CS110", "Exercise: FizzBuzz", "assignment", 1, 10, ["kwame.abiodun@ashf.example.edu"]),
    ("CS110", "Project 1: Grade calculator", "assignment", 6, 25, []),
]


# Topics per course: (title, summary, lessons as (module position, lesson position)).
TOPICS = {
    "PHY101": [
        ("Kinematics", "Describing motion with displacement, velocity and acceleration.", [(1, 1), (1, 2)]),
        ("Projectile motion", "Horizontal and vertical motion joined only by time.", [(1, 3)]),
        ("Newton's laws", "Forces, mass and how motion changes.", [(2, 1), (2, 2)]),
        ("Work and energy", "Energy transfer, kinetic energy and conservation.", [(3, 1), (3, 2)]),
    ],
    "MTH201": [
        ("Derivatives", "Rates of change and the rules for finding them.", [(1, 1), (1, 2)]),
        ("Integration", "Area under a curve and techniques for computing it.", [(2, 1), (2, 2)]),
        ("Series", "Sequences, convergence and Taylor polynomials.", [(3, 1), (3, 2)]),
    ],
    "CS110": [
        ("Data and decisions", "Values, types and branching with if.", [(1, 1), (1, 2)]),
        ("Loops", "Repeating work with for and while, and tracing it by hand.", [(2, 1), (2, 2)]),
        ("Functions and lists", "Reusable code and collections of values.", [(3, 1), (3, 2)]),
    ],
}

# Demo doubts: (course, lesson (module, lesson), student email, title, status, hours since asked,
#               [(author role, hours since sent, body)]). Reply targets follow the 48-hour default.
DOUBTS = [
    ("PHY101", (1, 3), "ingrid.abiodun@ashf.example.edu", "Why does 45 degrees give the longest range?", "open", 52,
     [("student", 52, "The lesson says range is largest at 45 degrees, but a steeper throw stays in the air longer. "
                      "Why doesn't more time in the air mean more distance?")]),
    ("PHY101", (1, 1), "ingrid.abiodun@ashf.example.edu", "Can velocity be negative if speed can't?", "answered", 30,
     [("student", 30, "If I walk back to where I started, is my velocity negative the whole way back?"),
      ("teacher", 20, "Yes. Velocity carries a direction, so choose one direction as positive. Walking back, "
                      "your velocity is negative while your speed stays positive. Your average velocity over the "
                      "whole trip is zero because your displacement is zero.")]),
    ("MTH201", (2, 2), "kwame.abiodun@ashf.example.edu", "How do I choose u and dv in integration by parts?", "open", 5,
     [("student", 5, "For the integral of x times e to the x, I picked u = e^x and it got worse. How do I choose?")]),
    ("MTH201", (1, 2), "kwame.abiodun@ashf.example.edu", "Chain rule with a square root", "resolved", 120,
     [("student", 120, "How do I differentiate the square root of (3x + 1)?"),
      ("teacher", 100, "Write it as (3x + 1)^(1/2). Bring the power down, reduce it by one, then multiply by "
                       "the derivative of the inside, which is 3."),
      ("student", 98, "Got it, 3 / (2 times the square root of (3x + 1)). Thanks!")]),
    ("CS110", (2, 2), "ingrid.abiodun@ashf.example.edu", "My while loop never stops", "open", 26,
     [("student", 26, "I wrote while count < 10: print(count) and it prints 0 forever. What did I miss?")]),
    ("CS110", (1, 2), "kwame.abiodun@ashf.example.edu", "Difference between = and ==", "answered", 60,
     [("student", 60, "When do I use one equals sign and when two?"),
      ("teacher", 44, "One equals sign stores a value: `x = 5`. Two compare values and give True or False: "
                      "`x == 5`. Conditions in `if` and `while` use two.")]),
]
