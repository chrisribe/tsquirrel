(function() {
  document.addEventListener('DOMContentLoaded', function() {

    // Demo Event listener for htmx response errors
    document.body.addEventListener('htmx:responseError', function(event) {
      if (event.detail.xhr.status > 399) {
				if (document.getElementById('message')){
        	document.getElementById('message').innerHTML = event.detail.xhr.responseText;
				}
				else {
					alert(event.detail.xhr.responseText);
				}
      }
    });

  });
})();