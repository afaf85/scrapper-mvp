export const templates = {
  // ✅ 1. Meta Square Ad (Supports Multiple Images)
  meta_square_ad: (selectedElements, handleTextChange) => {
    const images = selectedElements.image || [{ src: "placeholder.jpg", alt: "Default Image" }];
    const imageSrc = Array.isArray(images) ? images[0].src : images.src;
    const altText = Array.isArray(images) ? images[0].alt : images.alt || "Product Image";

    const title = selectedElements.title || "Your Ad Title";
    const price = selectedElements.price || "$0.00";
    const discount = selectedElements.discount || "Limited Offer!";
    const buttonText = selectedElements.button || "Shop Now";
    const link = "#";

    return `
       <div class="banner meta-square">
        <div class="image-container">
          <img src="${imageSrc}" onerror="this.src='placeholder.jpg';" crossorigin="anonymous" alt="${altText}" />
        </div>

        <div class="overlay">
          <h2 class="banner-title" contenteditable="true" data-field="title">${title}</h2>
          <p class="price" contenteditable="true" data-field="price">${price}</p>
          <p class="discount" contenteditable="true" data-field="discount">${discount}</p>
        </div>

        <a href="${link}" class="cta-button" contenteditable="true" data-field="button">${buttonText}</a>
      </div>
    `;
  },

  // ✅ 2. Hero Wide Ad (Fixed Background Image Handling)
  hero_wide_ad: (selectedElements, handleTextChange) => {
    const images = selectedElements.image || [{ src: "placeholder.jpg", alt: "Default Background" }];
    const imageSrc = Array.isArray(images) ? images[0].src : images.src;

    const title = selectedElements.title || "Catchy Headline Here";
    const subtitle = selectedElements.subtitle || "Supporting text goes here.";
    const buttonText = selectedElements.button || "Learn More";
    const link = "#";

    return `
      <div class="banner hero-wide">
        <div class="hero-image" style="background-image: url('${imageSrc}'); background-size: cover; background-position: center;">
          <div class="hero-text">
            <h1 contenteditable="true" data-field="title">${title}</h1>
            <p contenteditable="true" data-field="subtitle">${subtitle}</p>
            <a href="${link}" class="cta-button" contenteditable="true" data-field="button">${buttonText}</a>
          </div>
        </div>
      </div>
    `;
  },

  // ✅ 3. Compact Minimal Ad (Fixes Missing Image Handling)
  compact_ad: (selectedElements, handleTextChange) => {
    const images = selectedElements.image || [{ src: "placeholder.jpg", alt: "Compact Ad Image" }];
    const imageSrc = Array.isArray(images) ? images[0].src : images.src;
    const altText = Array.isArray(images) ? images[0].alt : images.alt || "Compact Image";

    const title = selectedElements.title || "Minimalist Ad";
    const buttonText = selectedElements.button || "Buy Now";
    const link = "#";

    return `
      <div class="banner compact-ad">
        <div class="compact-container">
          <img src="${imageSrc}" onerror="this.src='placeholder.jpg';" crossorigin="anonymous" alt="${altText}" class="compact-img"/>
          <div class="compact-text">
            <h2 contenteditable="true" data-field="title">${title}</h2>
            <a href="${link}" class="cta-button compact-btn" contenteditable="true" data-field="button">${buttonText}</a>
          </div>
        </div>
      </div>
    `;
  },
};
