---
question: Who has root on my machines?
shortAnswer: You do. There is no Auros account on the image and no remote access into your machines.
group: trust
order: 2
---

The image ships with no account for us. There is no support user, no authorised key of ours in
the image, and nothing on the machine that listens for a connection from us. The administrator
is whoever you set up during first-boot setup.

The honest part, which is the part that matters: we control the contents of the base image, and
a machine configured to update from that image trusts us the way any machine trusts whoever
builds its operating system. That is a real dependency and calling it anything else would be
dishonest.

Three things bound it.

1. Images are signed, and the machine verifies the signature before it will use one. An image
   that is not signed by our build does not install, including one that is ours in every other
   respect.
2. Every line that goes into your image is in a public repository. You can read the change. You
   can diff last night against tonight. You do not have to take our word for what is in it,
   which means you should not.
3. If that is still more trust than you want to extend, build from the public repository and
   point your machines at your own registry. Then you are the only one who can change what your
   machines run. That path is documented because we expect some customers to take it.

A fleet console is in the plan and does not exist yet. When it does, a machine will appear in it
because you enrolled it, not because it was built by us.
