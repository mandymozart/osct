import { ChapterData } from "../store/types";

export const chapters:ChapterData[] = [
    {
      id: "chapter1",
      order: 0,
      title: "The Beginning",
      imageTargetSrc: "/targets/single-image.mind",
      targets: [
        {
          mindarTargetIndex: 0,
          bookId: "001",
          title: "Bear",
          description: "A curious bear appears in the woods.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ]
          },
        },
        {
          mindarTargetIndex: 1,
          bookId: "002",
          title: "Ancient Tree",
          description: "A mystical tree stands tall.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ],
          },
        },
      ],
    },
    {
      id: "chapter2",
      order: 1,
      title: "The Castle Gates",
      imageTargetSrc: "/targets/single-image.mind",
      targets: [
        {
          mindarTargetIndex: 0,
          bookId: "003",
          title: "Old Castle",
          description: "An ancient castle filled with secrets.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ],
          },
        },
        {
          mindarTargetIndex: 1,
          bookId: "004",
          title: "Stone Guardian",
          description: "A stone statue guarding the entrance.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ],
          },
        },
      ],
    },
    {
      id: "chapter3",
      order: 2,
      title: "The Dragon's Lair",
      imageTargetSrc: "/targets/single-image.mind",
      targets: [
        {
          mindarTargetIndex: 0,
          bookId: "005",
          title: "Sleeping Dragon",
          description: "A mighty dragon resting in its lair.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ],
          },
        },
        {
          mindarTargetIndex: 1,
          bookId: "006",
          title: "Treasure Hoard",
          description: "A pile of gold and relics hidden in the shadows.",
          entity: {
            assets: [
              {
                src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              },
            ],
          },
        },
      ],
    },
  ];
  