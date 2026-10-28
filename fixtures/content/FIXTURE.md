# Test fixture – not the book

A slim copy of the placeholder content (every entity type, chroma key and alpha video, all spreads) with small
images, short low-resolution videos and one stand-in model. CI and the tests build it
(`OSCT_CONTENT_DIR=fixtures/content`). The book content is not in this repository (docs/content-cdn.md).

This file marks the fixture: the content build copies it into the build output, and `osct content sync` refuses a
build that contains it, so the fixture never reaches the CDN.
