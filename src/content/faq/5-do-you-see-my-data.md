---
question: Do you see my data?
shortAnswer: No. The archive of your files is written to a disk you provide and never leaves your premises. We never receive files.
group: data
order: 5
---

The migration copies your files from the machine to a disk you plugged in. That is the whole
path. There is no upload, no cloud staging area, and no account of ours involved. If your
network was unplugged for the entire migration it would work exactly the same.

What we do receive is the recipe: a list of package names, a locale, a keyboard layout, a policy
mode, and the name you gave the build. That is what the build service needs and it is all it
gets.

One thing to know before you type into the configurator: recipes are published in a public
repository, because that is what makes them rebuildable without us. So the name of your build
and any note attached to it is public. Do not put a pupil's name, a password, or anything else
private into a recipe. If you would rather the recipe carried no identifying name at all, say
so and we will use something neutral.

Once machines are running, they fetch images from a public registry. That fetch tells the
registry that an address pulled an image, the same way installing any software does. It does not
tell us, or anybody, what is on the machine.
