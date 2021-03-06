/*=============================================================
	Reddit API
==============================================================*/

var Settings = {
    layout: 'list', // Base layout
    numPosts: 50, // Max number of posts    
    sortBy: 'new', // Sorting system
    title: 'Reddit-Roll'
};

var Reddit = {
    after: [], // Stores the id of the last post
    subreddit: ''
};

/*=============================================================
	App
==============================================================*/

var app = angular.module('app', [
    'filters',
    'ngSanitize',
    'appControllers',
    'ui.bootstrap',
]);

/*=============================================================
	Routes
==============================================================*/

/*app.config(['$routeProvider',
    function($routeProvider) {
        $routeProvider
            .when('/', {
                controller: 'FrontPage'
            })
            .when('/pizza', {
                template: 'Yeah, pizza !'
            })
            .otherwise({
                redirectTo: '/'
            });
    }
]);*/

/*=============================================================
	Filters
==============================================================*/

angular.module('filters', [])

/** 
 * Returns a formated date from a timestamp using timeago plugin
 * @param {int} timestamp
 * @return {string}
 */
.filter('timeago', function() {
    return function(timestamp) {
        return jQuery.timeago(new Date(timestamp * 1000));
    }
})

/** 
 * Basic formatting of the comments
 * @param {string} input
 * @return {string}
 */
.filter('rendercomment', function() {
    return function(input) {
        if (input) {
            var bold = /\*\*(\S(.*?\S)?)\*\*/gm,
                italic = /\*(\S(.*?\S)?)\*/gm,
                remove = /\^\^/gm;
            input = input.replace(bold, '<strong>$1</strong>');
            input = input.replace(italic, '<em>$1</em>');
            input = input.replace(remove, '');
            return input;
        }
    }
})

/** 
 * Formatting for the multireddits tooltips
 * @param {array} input
 * @return {string}
 */
.filter('tooltip', function() {
    return function(input) {
        var output = '';
        for (var i = 0, l = input.length; i < l; i++) {
            output += input[i] + '<br>';
            if (i >= 12) {
                return output + '... ' + (l - i) + ' MORE ...';
            }
        };
        return output;
    }
})

/** 
 * Formatting for the multireddits name
 * @param {string} input
 * @return {string}
 */
.filter('multiname', function() {
    return function(input) {
        return capitaliseEachWord(input.split('_').join(' '));
    }
});


/*=============================================================
	Directives
==============================================================*/

/** 
 * Checks if the DOM is rendered, then calls some functions
 */
app.directive('domrendered', function() {
    return function() {

        var t = window.setInterval(function() {
            if ($('.post').length > 0) {
                window.clearInterval(t);
                domrendered();
            }
        }, 50);

        var domrendered = function() {
            activateOembed();
            makeLinksExternal();
        };
    }
});

/** 
 * Toggles subcomments on click
 */
app.directive('showsubcomments', function() {
    return function($scope, $element) {
        $element.on('click', function() {
            var $ul = $element.closest('li').find('ul').first();
            $ul.slideToggle();
            $element.find('.chevron').toggleClass('glyphicon-chevron-down');
        });
    }
});

/*=============================================================
	Controllers
==============================================================*/

var appControllers = angular.module('appControllers', []);

/*	FRONTPAGE
==============================================================*/

appControllers.controller('FrontPage', ['$scope', '$http', '$sce',
    function($scope, $http, $sce) {

        $scope.posts = [];

        $scope.multis = multireddits;

        /*	Data
		==============================================================*/

        /** 
         * Ajax call to the Reddit API
         */
        $scope.getPage = function() {
            NProgress.start().inc().inc();
            var url = 'http://www.reddit.com/';
            url += Reddit.subreddit ? 'r/' + Reddit.subreddit + '/' : '';
            url += ".json?&limit=" + Settings.numPosts + "&sort=" + Settings.sortBy + "&after=" + Reddit.after[Reddit.after.length - 1];

            $http.get(url)
                .success(function(data, status, headers, config) {
                    NProgress.inc().inc();
                    scrollToTop();
                    $scope.parseData(data);
                })
                .error(function(data, status, headers, config) {
                    NProgress.done();
                    alertInexistingSub(Reddit.subreddit);
                });
        }

        $scope.getPage();

        /** 
         * Load a subreddit
         * @param {string} names of subreddit
         */
        $scope.loadSub = function(sub) {
            Reddit.subreddit = sub;
            Reddit.after = [];
            $scope.disablePreviousButton();
            $scope.getPage();

            document.title = sub + ' | ' + Settings.title;
        }

        /** 
         * Load multireddits
         * @param {array} names of subreddits
         */
        $scope.loadMultis = function(multis) {
            var subs = multis.join('+');
            $scope.loadSub(subs);
        }

        /** 
         * Format the data received through the Ajax call and sets it to the $scope
         * @param {data} object
         */
        $scope.parseData = function(data) {
            NProgress.inc();
            Reddit.after.push(data.data.after);

            var posts = data.data.children;
            angular.forEach(posts, function(post) {
                $scope.getPostType(post);
            });
            $scope.posts = posts;
            NProgress.done();

            if (Settings.layout === 'grid') {
                reloadGrid();
            }
        }

        /** 
         * Find out the type of a post and adds it to the post object
         * @param {post} object
         */
        $scope.getPostType = function(post) {
            var url = post.data.url,
                extension = url.split(".")[url.split(".").length - 1],
                type = '',
                domain = post.data.domain;
            if (/jpg|png|gif|bmp|jpeg/.test(extension)) type = 'image';
            else if (/imgur.com\/a/.test(url)) {
                type = 'imguralb';
                post.data.url = $sce.trustAsResourceUrl(post.data.url + '/embed');
            } else if (/imgur.com/.test(url)) type = 'imgur';
            else if (post.data.selftext) {
                type = 'text';
                var text = unescape(post.data.selftext_html);
                post.data.content = $sce.trustAsHtml(text);
            } else if (domain === 'youtube.com' || domain === 'youtu.be') {
                type = 'video';
                var regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|\&v=)([^#\&\?]*).*/i,
                    match = post.data.url.match(regExp);
                if (match && match[2].length == 11) {
                    post.data.video = $sce.trustAsResourceUrl('//www.youtube.com/embed/' + match[2]);
                }
            } else if (domain === 'vimeo.com') {
                type = 'video';
                var regExp = /https?:\/\/(www\.)?vimeo.com\/(\d+)($|\/)/,
                    match = post.data.url.match(regExp);
                if (match && match[2].length > 0) {
                    post.data.video = $sce.trustAsResourceUrl('//player.vimeo.com/video/' + match[2]);
                }
            } else if (/wikipedia./.test(domain)) {
                type = 'wikipedia';
            } else if (/self.|reddit./.test(domain)) {
                type = 'reddit';
            } else type = 'oembed';
            post.data.type = type;
        }

        /*	Navigation / Buttons
		==============================================================*/

        /** 
         * Load the next page
         */
        $scope.nextPage = function() {
            $scope.getPage();
            $('#previous').removeClass('disabled');
        }

        /** 
         * Load the previous page
         */
        $scope.previousPage = function() {
            Reddit.after.splice(-2, 2);
            if (Reddit.after.length == 0) $scope.disablePreviousButton();
            $scope.getPage();
        }

        $scope.disablePreviousButton = function() {
            $('#previous').addClass('disabled');
        }

        $scope.loadComments = function(permalink) {
            $scope.$broadcast('loadComments', permalink);
        }

        $scope.clickSub = function() {
            $scope.loadSub(this.post.data.subreddit);
        }

        /** 
         * Toggle the layout between 'list' and 'grid'
         */
        $scope.toggleLayout = function(e) {
            var $target = $(e.target);
            if ($target.hasClass('glyphicon')) $target = $target.parent();
            if (Settings.layout === 'list') {
                Settings.layout = 'grid';
                setLayout('grid');
                $target.html('<i class="glyphicon glyphicon-th-list"></i>');
            } else {
                Settings.layout = 'list';
                setLayout('list');
                $target.html('<i class="glyphicon glyphicon-th"></i>');
            }
        }

        /** 
         * Toggle the visibility of post options buttons in the grid layout
         */
        $scope.showButtons = function(e) {
            e.preventDefault();
            var $target = $(e.target);
            if ($target.hasClass('glyphicon')) $target = $target.parent();
            $target.find('i').toggleClass('glyphicon-chevron-down');
            $target.siblings('.buttons').slideToggle('fast', function() {
                $('#main').isotope('reLayout');
            });
        }

        /*  Typeahead
        ==============================================================*/

        /** 
         * Autocomplete for the subreddit search
         * @param {val} string
         * @return {array}
         */
        /*$scope.getSubreddit = function(val) {
            return $http.get('http://www.reddit.com/subreddits/search/.json?', {
                params: {
                    q: val,
                    limit: 50
                }
            }).then(function(res) {
                var subreddits = [];
                angular.forEach(res.data.data.children, function(item) {
                    var url = item.data.url,
                        split = url.split('/'),
                        sub = split[2];
                    if (sub.indexOf(val) != -1) subreddits.push(sub);
                });
    console.log(subreddits);
                return subreddits;
            });
        }*/

        /* Comments
        ==============================================================*/

        /** 
         * Format the comments data received through the Ajax call and sets it to the $scope
         * @param {data} object
         * @return {object}
         */
        $scope.parseComments = function(data) {
            var comments = data[1].data.children;
            $scope.title = data[0].data.children[0].data.title;
            $scope.op = data[0].data.children[0].data.author;
            $scope.comments = $scope.parseReplies(comments);
            return comments;
        }

        /** 
         * Formats the sub-comments data
         * @param {comments} object
         * @return {object}
         */
        $scope.parseReplies = function(comments) {
            for (var i = 0, l = comments.length - 1; i < l; i++) {
                if (typeof comments[i].data.replies === 'object') {
                    var replies = comments[i].data.replies.data.children;
                    if (!replies[replies.length - 1].data.body) {
                        replies.pop();
                    }
                    comments[i].data.replies = $scope.parseReplies(replies);
                }
            }
            return comments;
        }
    }
]);


/*	COMMENTS
==============================================================*/
appControllers.controller('Comments', ['$scope', '$http',
    function($scope, $http) {
        $scope.meta = [];
        $scope.comments = [];

        /** 
         * Ajax call for the comments
         */
        $scope.$on('loadComments', function(e, permalink) {
            var winH = $(window).height(),
                navH = $('#nav').height(),
                commentsUrl = 'http://www.reddit.com' + permalink + '.json?&sort=best';

            showCommentsLoader();

            $('#comments').css('height', winH - navH).addClass('showing');

            $http.get(commentsUrl)
                .success(function(data, status, headers, config) {
                    $scope.comments = $scope.parseComments(data);
                    hideCommentsLoader();
                })
                .error(function(data, status, headers, config) {
                    console.log(data);
                });
        });

        $scope.closeComments = function() {
            $('#comments').removeClass('showing');
        }
    }
]);

/*=============================================================
	Modal
==============================================================*/

jQuery(document).ready(function($) {
    // Open login modal
    $('#log').on('click', function() {
        $('#loginModal').modal();
    });

    // Display tooltips
    $('a[data-toggle="tooltip"], #log').tooltip();

    // Scroll and keyboard nav
    var currentPost = 0;
    $(document).scroll(function() {
        var st = $(window).scrollTop();
        $('.post').each(function() {
            if ($(this).offset().top > st) {
                currentPost = $(this).prop('id').substr(4);
                return false;
            }
        });
    });

    $(window).keyup(function(e) {
        var target = e.target.tagName;
        if (target != 'input') {
            if (e.keyCode === 40 || e.keyCode === 74) {
                currentPost++;
                $('#post' + currentPost).scrollToMe();
            } else if (e.keyCode === 38 || e.keyCode === 75) {
                if (currentPost > 0) {
                    currentPost--;
                    $('#post' + currentPost).scrollToMe();
                }
            }
        }
    });

    $.fn.extend({
        scrollToMe: function(offset) {
            var b = $(this);
            offset = offset || -60;
            $("body").animate({
                scrollTop: b.offset().top + offset
            }, 200);
        }
    });

});