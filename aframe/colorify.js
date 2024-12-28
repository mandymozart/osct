AFRAME.registerComponent("colorify", {
    init: function () {
      let colors = ["#FF0000", "#00FF00", "#0000FF"];
      let i = 0;
      setInterval(() => {
        this.el.setAttribute("color", colors[i]);
        i = (i + 1) % colors.length;
      }, 3000);
    },
  });