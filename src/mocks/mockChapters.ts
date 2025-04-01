import { Chapter, LoadableResource, Asset } from './../store/types'

export const mockChapters: (Chapter & LoadableResource)[] = [
  {
    id: "chapter1",
    order: 0,
    title: "The Beginning",
    imageTargetSrc: "/targets/single-image.mind",
    isLoading: false,
    loaded: true,
    error: null,
    targets: [
      {
        mindarTargetIndex: 0,
        bookId: "001",
        title: "Bear",
        description: "A curious bear appears in the woods.",
        isLoading: false,
        loaded: false,
        error: null,
        entity: {
          assets: [
            {
              src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              isLoading: false,
              loaded: false,
              error: null
            } as Asset & LoadableResource
          ]
        }
      },
      {
        mindarTargetIndex: 1,
        bookId: "002",
        title: "Ancient Tree",
        description: "A mystical tree stands tall.",
        isLoading: false,
        loaded: false,
        error: null,
        entity: {
          assets: [
            {
              src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              isLoading: false,
              loaded: false,
              error: null
            } as Asset & LoadableResource
          ]
        }
      }
    ]
  },
  {
    id: "chapter2",
    order: 1,
    title: "The Castle Gates",
    imageTargetSrc: "/targets/single-image.mind",
    isLoading: false,
    loaded: false,
    error: null,
    targets: [
      {
        mindarTargetIndex: 0,
        bookId: "003",
        title: "Old Castle",
        description: "An ancient castle filled with secrets.",
        isLoading: false,
        loaded: false,
        error: null,
        entity: {
          assets: [
            {
              src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              isLoading: false,
              loaded: false,
              error: null
            } as Asset & LoadableResource
          ]
        }
      },
      {
        mindarTargetIndex: 1,
        bookId: "004",
        title: "Stone Guardian",
        description: "A stone statue guarding the entrance.",
        isLoading: false,
        loaded: false,
        error: null,
        entity: {
          assets: [
            {
              src: "https://cdn.jsdelivr.net/gh/hiukim/mind-ar-js@1.2.5/examples/image-tracking/assets/band-example/raccoon/scene.gltf",
              isLoading: false,
              loaded: false,
              error: null
            } as Asset & LoadableResource
          ]
        }
      }
    ]
  }
]